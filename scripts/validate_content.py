from __future__ import annotations

import json
import sys
from pathlib import Path


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


def validate_block(section_id: str, block: dict) -> None:
    if not block.get("id"):
        fail(f"block missing id in section {section_id}")
    kind = block.get("kind")
    if kind not in {"paragraph", "listItem", "table", "termNote", "heading"}:
        fail(f"invalid block kind in {block.get('id')}: {kind}")
    if kind in {"paragraph", "listItem", "termNote", "heading"} and not str(block.get("text", "")).strip():
        fail(f"text block is empty: {block.get('id')}")
    if kind == "table":
        rows = block.get("rows")
        if not isinstance(rows, list) or not rows:
            fail(f"table block missing rows: {block.get('id')}")
        if not any(any(str(cell).strip() for cell in row) for row in rows):
            fail(f"table block has no visible cells: {block.get('id')}")


def validate_section_lesson(path: Path, data: dict) -> None:
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
        print(f"ok: {path} ({len(data['chapters'])} manifest chapters)")
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
