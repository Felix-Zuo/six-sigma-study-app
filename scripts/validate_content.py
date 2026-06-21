from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_CONTENT_ROOT = REPO_ROOT / "apps" / "reader" / "public" / "content"


def fail(message: str) -> None:
    raise SystemExit(f"content validation failed: {message}")


def validate_legacy_lesson(path: Path, data: dict) -> None:
    if not isinstance(data.get("paragraphs"), list) or not data["paragraphs"]:
        fail("paragraphs must be a non-empty array")
    seen_ids: set[str] = set()
    for paragraph in data["paragraphs"]:
        for key in ["id", "page", "en", "zh"]:
            if key not in paragraph:
                fail(f"paragraph missing {key}: {paragraph!r}")
        if paragraph["id"] in seen_ids:
            fail(f"duplicate paragraph id: {paragraph['id']}")
        seen_ids.add(paragraph["id"])
        if not isinstance(paragraph["page"], int) or paragraph["page"] < 1:
            fail(f"invalid page for {paragraph['id']}")
        if not paragraph["en"].strip() or not paragraph["zh"].strip():
            fail(f"empty bilingual text for {paragraph['id']}")
    print(f"ok: {path} ({len(data['paragraphs'])} legacy paragraphs)")


def validate_image_asset(block: dict) -> None:
    for key in ["assetId", "src", "width", "height"]:
        if key not in block:
            fail(f"image block missing {key}: {block.get('id')}")
    src = str(block["src"])
    if src.startswith("/") or ".." in Path(src).parts:
        fail(f"unsafe image src in {block.get('id')}: {src}")
    asset_path = PUBLIC_CONTENT_ROOT / src
    if not asset_path.exists():
        fail(f"image asset does not exist for {block.get('id')}: {asset_path}")
    if asset_path.stat().st_size <= 0:
        fail(f"image asset is empty for {block.get('id')}: {asset_path}")
    if not isinstance(block["width"], int) or not isinstance(block["height"], int):
        fail(f"image dimensions must be integers: {block.get('id')}")
    if block["width"] <= 0 or block["height"] <= 0:
        fail(f"image dimensions must be positive: {block.get('id')}")


def validate_block(section_id: str, block: dict) -> None:
    if not block.get("id"):
        fail(f"block missing id in section {section_id}")
    kind = block.get("kind")
    if kind not in {"paragraph", "listItem", "table", "termNote", "heading", "image"}:
        fail(f"invalid block kind in {block.get('id')}: {kind}")
    if kind in {"paragraph", "listItem", "termNote", "heading"} and not str(block.get("text", "")).strip():
        fail(f"text block is empty: {block.get('id')}")
    if kind == "table":
        rows = block.get("rows")
        if not isinstance(rows, list) or not rows:
            fail(f"table block missing rows: {block.get('id')}")
        if not any(any(str(cell).strip() for cell in row) for row in rows):
            fail(f"table block has no visible cells: {block.get('id')}")
    if kind == "image":
        validate_image_asset(block)


def validate_assets(data: dict) -> None:
    assets = data.get("assets", [])
    if assets is None:
        return
    if not isinstance(assets, list):
        fail(f"assets must be an array in {data.get('id')}")
    seen_ids: set[str] = set()
    for asset in assets:
        for key in ["id", "type", "path", "page"]:
            if key not in asset:
                fail(f"asset missing {key}: {asset!r}")
        if asset["id"] in seen_ids:
            fail(f"duplicate asset id in {data.get('id')}: {asset['id']}")
        seen_ids.add(asset["id"])
        if asset["type"] not in {"figure", "table-image", "formula-image"}:
            fail(f"invalid asset type for {asset['id']}: {asset['type']}")
        if not isinstance(asset["page"], int) or asset["page"] < 1:
            fail(f"invalid asset page for {asset['id']}")
        asset_path = PUBLIC_CONTENT_ROOT / str(asset["path"])
        if not asset_path.exists():
            fail(f"asset file does not exist for {asset['id']}: {asset_path}")


def validate_section_lesson(path: Path, data: dict, quiet: bool = False) -> None:
    for key in ["id", "chapter", "pageStart", "pageEnd", "title", "sections"]:
        if key not in data:
            fail(f"lesson missing {key}")
    if not isinstance(data["sections"], list) or not data["sections"]:
        fail("sections must be a non-empty array")
    seen_ids: set[str] = set()
    for section in data["sections"]:
        for key in ["id", "page", "level", "title", "content"]:
            if key not in section:
                fail(f"section missing {key}: {section!r}")
        if section["id"] in seen_ids:
            fail(f"duplicate section id: {section['id']}")
        seen_ids.add(section["id"])
        if not isinstance(section["page"], int) or section["page"] < 1:
            fail(f"invalid page for section {section['id']}")
        title = section["title"]
        if not title.get("en") or not title.get("zh"):
            fail(f"section missing bilingual title: {section['id']}")
        content = section["content"]
        for language in ["en", "zh"]:
            blocks = content.get(language)
            if not isinstance(blocks, list) or not blocks:
                fail(f"section {section['id']} missing {language} blocks")
            for block in blocks:
                validate_block(section["id"], block)
    validate_assets(data)
    if not quiet:
        print(f"ok: {path} ({len(data['sections'])} sections)")


def validate_dictionary(path: Path, data: object) -> None:
    if not isinstance(data, list) or not data:
        fail("dictionary must be a non-empty array")
    seen_keys: set[str] = set()
    for entry in data:
        if not isinstance(entry, dict):
            fail(f"dictionary entry is not an object: {entry!r}")
        for key in ["term", "translation", "explanation", "lookupKeys"]:
            if key not in entry:
                fail(f"dictionary entry missing {key}: {entry!r}")
        if not isinstance(entry["lookupKeys"], list) or not entry["lookupKeys"]:
            fail(f"dictionary entry missing lookup keys: {entry['term']}")
        for lookup_key in entry["lookupKeys"]:
            normalized = str(lookup_key).strip().lower()
            if normalized in seen_keys:
                fail(f"duplicate lookup key: {lookup_key}")
            seen_keys.add(normalized)
    print(f"ok: {path} ({len(data)} terms)")


def validate_file(path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict) and "sections" in data:
        validate_section_lesson(path, data)
    elif isinstance(data, dict) and "paragraphs" in data:
        validate_legacy_lesson(path, data)
    elif isinstance(data, list):
        validate_dictionary(path, data)
    elif isinstance(data, dict) and "chapters" in data:
        chapters = data["chapters"]
        if chapters and isinstance(chapters[0], dict) and "sections" in chapters[0]:
            for chapter in chapters:
                validate_section_lesson(path, chapter, quiet=True)
            print(f"ok: {path} ({len(chapters)} manual chapters)")
        else:
            print(f"ok: {path} ({len(chapters)} manifest chapters)")
    else:
        fail(f"unrecognized content file: {path}")


def iter_json_files(path: Path) -> list[Path]:
    if path.is_dir():
        return sorted(path.rglob("*.json"))
    return [path]


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python scripts/validate_content.py <lesson-or-directory>")
    for path in iter_json_files(Path(sys.argv[1])):
        validate_file(path)


if __name__ == "__main__":
    main()
