from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
def load_overrides(repo_root: Path = REPO_ROOT) -> dict[str, Any]:
    override_dir = repo_root / "content" / "overrides"
    merged: dict[str, Any] = {"schemaVersion": "1.0.0", "assets": [], "operations": []}
    for path in sorted(override_dir.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        merged["assets"].extend(payload.get("assets", []))
        merged["operations"].extend(payload.get("operations", []))
    return merged


def find_section(manual: dict[str, Any], chapter_id: str, section_id: str) -> dict[str, Any]:
    chapter = next((item for item in manual["chapters"] if item["id"] == chapter_id), None)
    if chapter is None:
        raise KeyError(f"override chapter not found: {chapter_id}")
    section = next((item for item in chapter["sections"] if item["id"] == section_id), None)
    if section is None:
        raise KeyError(f"override section not found: {chapter_id}/{section_id}")
    return section


def block_index(blocks: list[dict[str, Any]], block_id: str) -> int:
    for index, block in enumerate(blocks):
        if block.get("id") == block_id:
            return index
    raise KeyError(f"override block not found: {block_id}")


def apply_overrides(manual: dict[str, Any], spec: dict[str, Any]) -> dict[str, Any]:
    chapters = {chapter["id"]: chapter for chapter in manual["chapters"]}
    for registration in spec.get("assets", []):
        chapter = chapters.get(registration["chapterId"])
        if chapter is None:
            raise KeyError(f"override asset chapter not found: {registration['chapterId']}")
        asset = registration["asset"]
        chapter.setdefault("assets", [])[:] = [item for item in chapter.get("assets", []) if item.get("id") != asset["id"]]
        chapter["assets"].append(asset)

    for operation in spec.get("operations", []):
        section = find_section(manual, operation["chapterId"], operation["sectionId"])
        blocks = section["content"][operation["language"]]
        kind = operation["operation"]
        if kind == "replaceRange":
            obsolete_ids = set(operation.get("obsoleteBlockIds", []))
            if obsolete_ids:
                blocks[:] = [block for block in blocks if block.get("id") not in obsolete_ids]
            replacement_ids = {block["id"] for block in operation["blocks"]}
            existing_ids = {block.get("id") for block in blocks}
            try:
                start = block_index(blocks, operation["startBlockId"])
                end = block_index(blocks, operation["endBlockId"])
            except KeyError:
                if replacement_ids.issubset(existing_ids):
                    existing_by_id = {block.get("id"): block for block in blocks}
                    if all(existing_by_id.get(block["id"]) == block for block in operation["blocks"]):
                        continue
                    insertion_index = min(
                        index for index, block in enumerate(blocks) if block.get("id") in replacement_ids
                    )
                    blocks[:] = [block for block in blocks if block.get("id") not in replacement_ids]
                    blocks[insertion_index:insertion_index] = operation["blocks"]
                    continue
                if operation["startBlockId"] in existing_ids:
                    start = block_index(blocks, operation["startBlockId"])
                    existing_replacement_ids = replacement_ids & existing_ids
                    blocks[:] = [
                        block
                        for index, block in enumerate(blocks)
                        if index == start or block.get("id") not in existing_replacement_ids
                    ]
                    start = block_index(blocks, operation["startBlockId"])
                    blocks[start : start + 1] = operation["blocks"]
                    continue
                raise
            if end < start:
                raise ValueError(f"invalid override range: {operation}")
            blocks[start : end + 1] = operation["blocks"]
        elif kind == "insertAfter":
            index = block_index(blocks, operation["afterBlockId"])
            new_ids = {block["id"] for block in operation["blocks"]}
            blocks[:] = [block for block in blocks if block.get("id") not in new_ids]
            index = block_index(blocks, operation["afterBlockId"])
            blocks[index + 1 : index + 1] = operation["blocks"]
        else:
            raise ValueError(f"unsupported override operation: {kind}")
    return manual


def write_manual(repo_root: Path, manual: dict[str, Any]) -> None:
    processed = repo_root / "content" / "processed"
    chapters_dir = processed / "chapters"
    for chapter in manual["chapters"]:
        (chapters_dir / f"{chapter['id']}.json").write_text(
            json.dumps(chapter, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    manual_path = processed / "manual.json"
    manual_path.write_text(json.dumps(manual, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    public_content = repo_root / "apps" / "reader" / "public" / "content"
    shutil.copyfile(manual_path, public_content / "manual.json")

    assets_by_id = {
        asset["id"]: asset
        for chapter in manual["chapters"]
        for asset in chapter.get("assets", [])
    }
    manifest_assets = []
    for asset_id, asset in sorted(assets_by_id.items()):
        asset_path = public_content / asset["path"]
        if not asset_path.exists():
            raise FileNotFoundError(f"override asset file missing: {asset_path}")
        manifest_assets.append({"id": asset_id, "path": asset["path"], "bytes": asset_path.stat().st_size})
    asset_manifest = {
        "version": manual.get("version", "0.2.0"),
        "assetCount": len(manifest_assets),
        "assets": manifest_assets,
    }
    (public_content / "assets" / "asset-manifest.json").write_text(
        json.dumps(asset_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    book_id = manual.get("bookId", "six-sigma-black-belt")
    for catalog_path in (processed / "catalog.json", public_content / "catalog.json"):
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        catalog_book = next((book for book in catalog.get("books", []) if book.get("bookId") == book_id), None)
        if catalog_book is None:
            raise KeyError(f"override catalog book not found: {book_id}")
        catalog_book["assetCount"] = len(manifest_assets)
        catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply durable human-reviewed corrections to generated manual content.")
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT)
    args = parser.parse_args()
    manual_path = args.repo_root / "content" / "processed" / "manual.json"
    manual = json.loads(manual_path.read_text(encoding="utf-8"))
    spec = load_overrides(args.repo_root)
    apply_overrides(manual, spec)
    write_manual(args.repo_root, manual)
    print(json.dumps({"ok": True, "operations": len(spec.get("operations", []))}, ensure_ascii=False))


if __name__ == "__main__":
    main()
