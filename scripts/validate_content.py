from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_CONTENT_ROOT = REPO_ROOT / "apps" / "reader" / "public" / "content"
EXPECTED_CHAPTERS = 33
EXPECTED_PAGE_COUNT = 449
EXPECTED_FIRST_STUDY_PAGE = 6


def fail(message: str) -> None:
    raise SystemExit(f"content validation failed: {message}")


def normalize_lookup_key(value: object) -> str:
    return " ".join(
        "".join(char.lower() if char.isalnum() or char == "σ" else " " for char in str(value)).split()
    )


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


def validate_block(section_id: str, block: dict, asset_ids: set[str] | None = None) -> None:
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
        if asset_ids is not None and block["assetId"] not in asset_ids:
            fail(f"image block references asset missing from chapter metadata: {block['assetId']}")


def validate_assets(data: dict) -> set[str]:
    assets = data.get("assets", [])
    if assets is None:
        return set()
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
        if data.get("pageStart") and data.get("pageEnd"):
            if not (data["pageStart"] <= asset["page"] <= data["pageEnd"]):
                fail(f"asset page outside chapter range for {asset['id']}: {asset['page']}")
        asset_src = str(asset["path"])
        if asset_src.startswith("/") or ".." in Path(asset_src).parts:
            fail(f"unsafe asset path for {asset['id']}: {asset_src}")
        asset_path = PUBLIC_CONTENT_ROOT / asset_src
        if not asset_path.exists():
            fail(f"asset file does not exist for {asset['id']}: {asset_path}")
    return seen_ids


def validate_section_lesson(
    path: Path,
    data: dict,
    quiet: bool = False,
    global_section_ids: set[str] | None = None,
    global_block_ids: set[str] | None = None,
) -> None:
    for key in ["id", "chapter", "pageStart", "pageEnd", "title", "sections"]:
        if key not in data:
            fail(f"lesson missing {key}")
    if not isinstance(data["pageStart"], int) or not isinstance(data["pageEnd"], int):
        fail(f"chapter page range must be integers: {data.get('id')}")
    if data["pageStart"] > data["pageEnd"]:
        fail(f"chapter page range is inverted: {data.get('id')}")
    if not isinstance(data["sections"], list) or not data["sections"]:
        fail("sections must be a non-empty array")
    lesson_title = data["title"]
    if not isinstance(lesson_title, dict) or not lesson_title.get("en") or not lesson_title.get("zh"):
        fail(f"chapter missing bilingual title: {data.get('id')}")
    asset_ids = validate_assets(data)
    seen_ids: set[str] = set()
    seen_block_ids: set[str] = set()
    referenced_asset_ids: set[str] = set()
    previous_page = data["pageStart"]
    for section in data["sections"]:
        for key in ["id", "page", "level", "title", "content"]:
            if key not in section:
                fail(f"section missing {key}: {section!r}")
        if section["id"] in seen_ids:
            fail(f"duplicate section id: {section['id']}")
        if global_section_ids is not None:
            if section["id"] in global_section_ids:
                fail(f"duplicate global section id: {section['id']}")
            global_section_ids.add(section["id"])
        seen_ids.add(section["id"])
        if not isinstance(section["page"], int) or section["page"] < 1:
            fail(f"invalid page for section {section['id']}")
        if not (data["pageStart"] <= section["page"] <= data["pageEnd"]):
            fail(f"section page outside chapter range for {section['id']}: {section['page']}")
        if section["page"] < previous_page:
            fail(f"section pages must be nondecreasing in {data.get('id')}: {section['id']}")
        previous_page = section["page"]
        if not isinstance(section["level"], int) or section["level"] < 1:
            fail(f"invalid section level for {section['id']}: {section['level']}")
        title = section["title"]
        if not title.get("en") or not title.get("zh"):
            fail(f"section missing bilingual title: {section['id']}")
        content = section["content"]
        for language in ["en", "zh"]:
            blocks = content.get(language)
            if not isinstance(blocks, list) or not blocks:
                fail(f"section {section['id']} missing {language} blocks")
            for block in blocks:
                block_id = block.get("id")
                if block_id in seen_block_ids:
                    fail(f"duplicate block id in {data.get('id')}: {block_id}")
                if global_block_ids is not None:
                    if block_id in global_block_ids:
                        fail(f"duplicate global block id: {block_id}")
                    global_block_ids.add(block_id)
                seen_block_ids.add(block_id)
                validate_block(section["id"], block, asset_ids)
                if block.get("kind") == "image":
                    referenced_asset_ids.add(str(block["assetId"]))
    unused_assets = asset_ids - referenced_asset_ids
    if unused_assets:
        fail(f"chapter assets not referenced by image blocks in {data.get('id')}: {sorted(unused_assets)[:5]}")
    if not quiet:
        print(f"ok: {path} ({len(data['sections'])} sections)")


def validate_dictionary(path: Path, data: object, quiet: bool = False) -> None:
    if not isinstance(data, list) or not data:
        fail("dictionary must be a non-empty array")
    seen_keys: dict[str, str] = {}
    for entry in data:
        if not isinstance(entry, dict):
            fail(f"dictionary entry is not an object: {entry!r}")
        for key in ["term", "translation", "explanation", "lookupKeys"]:
            if key not in entry:
                fail(f"dictionary entry missing {key}: {entry!r}")
        if not isinstance(entry["lookupKeys"], list) or not entry["lookupKeys"]:
            fail(f"dictionary entry missing lookup keys: {entry['term']}")
        for lookup_key in [entry["term"], *entry["lookupKeys"]]:
            normalized = normalize_lookup_key(lookup_key)
            if not normalized:
                fail(f"empty normalized lookup key: {entry['term']}")
            if normalized in seen_keys and seen_keys[normalized] != entry["term"]:
                fail(f"duplicate lookup key: {lookup_key}")
            seen_keys[normalized] = entry["term"]
    if not quiet:
        print(f"ok: {path} ({len(data)} terms)")


def validate_manifest(path: Path, data: dict) -> None:
    if data.get("pageCount") != EXPECTED_PAGE_COUNT:
        fail(f"manifest pageCount must be {EXPECTED_PAGE_COUNT}: {data.get('pageCount')}")
    chapters = data.get("chapters")
    if not isinstance(chapters, list) or len(chapters) != EXPECTED_CHAPTERS:
        fail(f"manifest must contain {EXPECTED_CHAPTERS} chapters")
    previous_end = EXPECTED_FIRST_STUDY_PAGE - 1
    seen_ids: set[str] = set()
    for expected_chapter, chapter in enumerate(chapters, start=1):
        for key in ["id", "chapter", "title", "pageStart", "pageEnd", "path"]:
            if key not in chapter:
                fail(f"manifest chapter missing {key}: {chapter!r}")
        if chapter["id"] in seen_ids:
            fail(f"duplicate manifest chapter id: {chapter['id']}")
        seen_ids.add(chapter["id"])
        if chapter["chapter"] != expected_chapter:
            fail(f"manifest chapter sequence mismatch: expected {expected_chapter}, got {chapter['chapter']}")
        if chapter["pageStart"] != previous_end + 1:
            fail(f"manifest page range gap before chapter {chapter['chapter']}")
        if chapter["pageStart"] > chapter["pageEnd"]:
            fail(f"manifest inverted page range for chapter {chapter['chapter']}")
        previous_end = chapter["pageEnd"]
        chapter_path = path.parent / str(chapter["path"])
        if not chapter_path.exists():
            fail(f"manifest chapter path does not exist: {chapter_path}")
    if previous_end != EXPECTED_PAGE_COUNT:
        fail(f"manifest final page must be {EXPECTED_PAGE_COUNT}: {previous_end}")
    print(f"ok: {path} ({len(chapters)} manifest chapters)")


def validate_manual(path: Path, data: dict) -> None:
    if data.get("pageCount") != EXPECTED_PAGE_COUNT:
        fail(f"manual pageCount must be {EXPECTED_PAGE_COUNT}: {data.get('pageCount')}")
    chapters = data.get("chapters")
    if not isinstance(chapters, list) or len(chapters) != EXPECTED_CHAPTERS:
        fail(f"manual must contain {EXPECTED_CHAPTERS} chapters")
    validate_dictionary(path, data.get("dictionary"), quiet=True)
    previous_end = EXPECTED_FIRST_STUDY_PAGE - 1
    global_section_ids: set[str] = set()
    global_block_ids: set[str] = set()
    for expected_chapter, chapter in enumerate(chapters, start=1):
        if chapter.get("chapter") != expected_chapter:
            fail(f"manual chapter sequence mismatch: expected {expected_chapter}, got {chapter.get('chapter')}")
        if chapter.get("pageStart") != previous_end + 1:
            fail(f"manual page range gap before chapter {chapter.get('chapter')}")
        validate_section_lesson(path, chapter, quiet=True, global_section_ids=global_section_ids, global_block_ids=global_block_ids)
        previous_end = chapter["pageEnd"]
    if previous_end != EXPECTED_PAGE_COUNT:
        fail(f"manual final page must be {EXPECTED_PAGE_COUNT}: {previous_end}")
    print(f"ok: {path} ({len(chapters)} manual chapters)")


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
            validate_manual(path, data)
        else:
            validate_manifest(path, data)
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
