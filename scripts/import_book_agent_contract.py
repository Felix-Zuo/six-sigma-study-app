from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REQUEST = REPO_ROOT / "samples" / "agent-import" / "sample-book-request.json"
DEFAULT_PROCESSED_CATALOG = REPO_ROOT / "content" / "processed" / "catalog.json"
DEFAULT_PUBLIC_CATALOG = REPO_ROOT / "apps" / "reader" / "public" / "content" / "catalog.json"
DEFAULT_PUBLIC_ROOT = REPO_ROOT / "apps" / "reader" / "public"
DEFAULT_SAMPLE_BOOK = "agent-import-sample"
BOOK_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,63}$")
TEXT_BLOCK_KINDS = {"paragraph", "listItem", "termNote", "heading"}
BLOCK_KINDS = {*TEXT_BLOCK_KINDS, "table", "image"}
ASSET_TYPES = {"figure", "table-image", "formula-image"}


class ContractError(Exception):
    pass


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError as exc:
        raise ContractError(f"file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ContractError(f"invalid JSON in {path}: {exc}") from exc


def fail(message: str) -> None:
    raise ContractError(message)


def localized(value: Any, field: str) -> None:
    if not isinstance(value, dict) or not str(value.get("en", "")).strip() or not str(value.get("zh", "")).strip():
        fail(f"{field} must include non-empty en and zh text")


def normalize_lookup_key(value: object) -> str:
    return " ".join(
        "".join(char.lower() if char.isalnum() or char == "σ" else " " for char in str(value)).split()
    )


def safe_relative(path_text: str, field: str) -> Path:
    path = Path(path_text)
    if path.is_absolute() or ".." in path.parts:
        fail(f"{field} must be a safe relative path: {path_text}")
    return path


def validate_request(path: Path) -> dict[str, Any]:
    data = load_json(path)
    if not isinstance(data, dict):
        fail("agent import request must be an object")
    if data.get("schemaVersion") != "1.0.0":
        fail("agent import request schemaVersion must be 1.0.0")

    book = data.get("book")
    if not isinstance(book, dict):
        fail("agent import request missing book object")
    book_id = str(book.get("bookId", ""))
    if not BOOK_ID_RE.fullmatch(book_id):
        fail(f"invalid bookId: {book_id}")
    localized(book.get("title"), "book.title")
    localized(book.get("licenseNotice"), "book.licenseNotice")
    if "en" not in book.get("languagePair", []) or "zh" not in book.get("languagePair", []):
        fail("book.languagePair must include en and zh")
    if book.get("rightsStatus") == "blocked-unknown":
        fail("book rightsStatus is blocked-unknown")
    if book.get("intendedUse") != "non-commercial-study":
        fail("book intendedUse must be non-commercial-study")

    sources = data.get("sources")
    if not isinstance(sources, list) or not sources:
        fail("agent import request must include sources")
    for source in sources:
        if source.get("rightsStatus") == "blocked-unknown":
            fail(f"source rightsStatus is blocked-unknown: {source.get('path')}")
        if not source.get("path"):
            fail("source missing path")

    plan = data.get("conversionPlan")
    if not isinstance(plan, dict):
        fail("agent import request missing conversionPlan")
    expected_path = f"content/books/{book_id}/manual.json"
    if plan.get("outputContentPath") != expected_path:
        fail(f"conversionPlan.outputContentPath must be {expected_path}")
    if plan.get("runtimeContentPath") != expected_path:
        fail(f"conversionPlan.runtimeContentPath must be {expected_path}")
    if plan.get("allowCommercialUse") is not False:
        fail("conversionPlan.allowCommercialUse must be false")

    gates = data.get("reviewGates")
    if not isinstance(gates, dict):
        fail("agent import request missing reviewGates")
    for gate in ["copyright", "toc", "imageQuality", "terminology", "bilingualAlignment"]:
        current = gates.get(gate)
        if not isinstance(current, dict) or current.get("required") is not True:
            fail(f"review gate {gate} must be required")
        if current.get("status") not in {"pending", "passed", "blocked"}:
            fail(f"review gate {gate} has invalid status")
        if current.get("status") == "blocked":
            fail(f"review gate {gate} is blocked")
    return data


def validate_block(
    block: dict[str, Any],
    section_id: str,
    page_start: int,
    page_end: int,
    asset_ids: set[str],
    public_root: Path,
) -> int:
    block_id = block.get("id")
    if not block_id:
        fail(f"block missing id in {section_id}")
    kind = block.get("kind")
    if kind not in BLOCK_KINDS:
        fail(f"invalid block kind in {block_id}: {kind}")
    page = block.get("page")
    if not isinstance(page, int) or not (page_start <= page <= page_end):
        fail(f"block page outside chapter range in {block_id}: {page}")
    if kind in TEXT_BLOCK_KINDS and not str(block.get("text", "")).strip():
        fail(f"text block is empty: {block_id}")
    if kind == "table":
        rows = block.get("rows")
        if not isinstance(rows, list) or not rows or not any(any(str(cell).strip() for cell in row) for row in rows):
            fail(f"table block has no visible cells: {block_id}")
    if kind == "image":
        for key in ["assetId", "src", "width", "height"]:
            if key not in block:
                fail(f"image block missing {key}: {block_id}")
        if block["assetId"] not in asset_ids:
            fail(f"image block references missing asset metadata: {block_id}")
        src = safe_relative(str(block["src"]), f"{block_id}.src")
        asset_path = public_root / "content" / src
        if not asset_path.exists():
            fail(f"image block file missing: {asset_path}")
        if not isinstance(block["width"], int) or not isinstance(block["height"], int):
            fail(f"image dimensions must be integers: {block_id}")
    return page


def validate_assets(chapter: dict[str, Any], public_root: Path) -> set[str]:
    assets = chapter.get("assets", [])
    if assets is None:
        return set()
    if not isinstance(assets, list):
        fail(f"assets must be an array in {chapter.get('id')}")
    seen: set[str] = set()
    for asset in assets:
        if not isinstance(asset, dict):
            fail(f"asset is not an object in {chapter.get('id')}")
        for key in ["id", "type", "path", "page"]:
            if key not in asset:
                fail(f"asset missing {key}: {chapter.get('id')}")
        if asset["id"] in seen:
            fail(f"duplicate asset id: {asset['id']}")
        seen.add(asset["id"])
        if asset["type"] not in ASSET_TYPES:
            fail(f"invalid asset type: {asset['type']}")
        if not isinstance(asset["page"], int) or not (chapter["pageStart"] <= asset["page"] <= chapter["pageEnd"]):
            fail(f"asset page outside chapter range: {asset['id']}")
        asset_path = safe_relative(str(asset["path"]), f"{asset['id']}.path")
        resolved = public_root / "content" / asset_path
        if not resolved.exists():
            fail(f"asset file missing: {resolved}")
    return seen


def validate_dictionary(entries: Any) -> None:
    if not isinstance(entries, list):
        fail("dictionary must be an array")
    seen: dict[str, str] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            fail("dictionary entry must be an object")
        for key in ["term", "translation", "explanation", "lookupKeys"]:
            if key not in entry:
                fail(f"dictionary entry missing {key}: {entry!r}")
        if not isinstance(entry["lookupKeys"], list) or not entry["lookupKeys"]:
            fail(f"dictionary entry missing lookupKeys: {entry.get('term')}")
        for lookup_key in [entry["term"], *entry["lookupKeys"]]:
            normalized = normalize_lookup_key(lookup_key)
            if not normalized:
                fail(f"empty normalized lookup key: {entry.get('term')}")
            if normalized in seen and seen[normalized] != entry["term"]:
                fail(f"duplicate dictionary lookup key {lookup_key!r}: {entry['term']} conflicts with {seen[normalized]}")
            seen[normalized] = entry["term"]


def validate_book_package(path: Path, public_root: Path) -> dict[str, Any]:
    data = load_json(path)
    if not isinstance(data, dict):
        fail(f"book package must be an object: {path}")
    book_id = str(data.get("bookId", ""))
    if not BOOK_ID_RE.fullmatch(book_id):
        fail(f"invalid package bookId in {path}: {book_id}")
    localized(data.get("title"), f"{book_id}.title")
    localized(data.get("licenseNotice"), f"{book_id}.licenseNotice")
    if not isinstance(data.get("pageCount"), int) or data["pageCount"] < 1:
        fail(f"{book_id}.pageCount must be a positive integer")
    chapters = data.get("chapters")
    if not isinstance(chapters, list) or not chapters:
        fail(f"{book_id}.chapters must be a non-empty array")

    previous_end: int | None = None
    seen_chapters: set[str] = set()
    seen_sections: set[str] = set()
    seen_blocks: set[str] = set()
    total_assets = 0

    for index, chapter in enumerate(chapters, start=1):
        if not isinstance(chapter, dict):
            fail(f"{book_id} chapter is not an object")
        for key in ["id", "chapter", "pageStart", "pageEnd", "title", "sections"]:
            if key not in chapter:
                fail(f"{book_id} chapter missing {key}")
        if chapter["id"] in seen_chapters:
            fail(f"duplicate chapter id: {chapter['id']}")
        seen_chapters.add(chapter["id"])
        if chapter["chapter"] != index:
            fail(f"chapter sequence mismatch in {book_id}: expected {index}, got {chapter['chapter']}")
        if not isinstance(chapter["pageStart"], int) or not isinstance(chapter["pageEnd"], int):
            fail(f"chapter pages must be integers: {chapter['id']}")
        if chapter["pageStart"] > chapter["pageEnd"]:
            fail(f"chapter page range inverted: {chapter['id']}")
        if previous_end is not None and chapter["pageStart"] != previous_end + 1:
            fail(f"chapter page gap before {chapter['id']}")
        previous_end = chapter["pageEnd"]
        localized(chapter.get("title"), f"{chapter['id']}.title")

        asset_ids = validate_assets(chapter, public_root)
        total_assets += len(asset_ids)
        section_pages = {"en": set(), "zh": set()}
        for section in chapter.get("sections", []):
            for key in ["id", "page", "level", "title", "content"]:
                if key not in section:
                    fail(f"section missing {key}: {chapter['id']}")
            if section["id"] in seen_sections:
                fail(f"duplicate section id: {section['id']}")
            seen_sections.add(section["id"])
            if not (chapter["pageStart"] <= section["page"] <= chapter["pageEnd"]):
                fail(f"section page outside chapter range: {section['id']}")
            localized(section.get("title"), f"{section['id']}.title")
            content = section.get("content")
            if not isinstance(content, dict):
                fail(f"section content must be an object: {section['id']}")
            for language in ["en", "zh"]:
                blocks = content.get(language)
                if not isinstance(blocks, list) or not blocks:
                    fail(f"section {section['id']} missing {language} blocks")
                for block in blocks:
                    block_id = block.get("id") if isinstance(block, dict) else None
                    if block_id in seen_blocks:
                        fail(f"duplicate block id: {block_id}")
                    seen_blocks.add(block_id)
                    page = validate_block(block, section["id"], chapter["pageStart"], chapter["pageEnd"], asset_ids, public_root)
                    section_pages[language].add(page)
        expected_pages = set(range(chapter["pageStart"], chapter["pageEnd"] + 1))
        for language, pages in section_pages.items():
            missing = sorted(expected_pages - pages)
            if missing:
                fail(f"chapter {chapter['id']} missing {language} page anchors: {missing[:8]}")

    if previous_end != data["pageCount"]:
        fail(f"{book_id}.pageCount must match final chapter pageEnd: {previous_end}")
    validate_dictionary(data.get("dictionary"))
    data["_validatedAssetCount"] = total_assets
    return data


def validate_catalog(catalog_path: Path, public_root: Path, require_sample: bool = False) -> dict[str, Any]:
    data = load_json(catalog_path)
    if not isinstance(data, dict):
        fail(f"catalog must be an object: {catalog_path}")
    books = data.get("books")
    if not isinstance(books, list) or not books:
        fail(f"catalog books must be non-empty: {catalog_path}")
    seen: set[str] = set()
    default_book_id = data.get("defaultBookId")
    for book in books:
        for key in ["bookId", "title", "languagePair", "contentPath", "pageCount", "chapterCount", "source", "licenseNotice"]:
            if key not in book:
                fail(f"catalog book missing {key}: {catalog_path}")
        book_id = book["bookId"]
        if book_id in seen:
            fail(f"duplicate catalog bookId: {book_id}")
        seen.add(book_id)
        localized(book.get("title"), f"catalog.{book_id}.title")
        localized(book.get("licenseNotice"), f"catalog.{book_id}.licenseNotice")
        content_path = safe_relative(str(book["contentPath"]), f"catalog.{book_id}.contentPath")
        package_path = public_root / content_path
        package_data = validate_book_package(package_path, public_root)
        if package_data["bookId"] != book_id:
            fail(f"catalog/package bookId mismatch: {book_id} vs {package_data['bookId']}")
        if package_data["pageCount"] != book["pageCount"]:
            fail(f"catalog pageCount mismatch for {book_id}")
        if len(package_data["chapters"]) != book["chapterCount"]:
            fail(f"catalog chapterCount mismatch for {book_id}")
        if int(book.get("assetCount", 0)) != package_data["_validatedAssetCount"]:
            fail(f"catalog assetCount mismatch for {book_id}")
    if default_book_id not in seen:
        fail(f"catalog defaultBookId not found: {default_book_id}")
    if require_sample and DEFAULT_SAMPLE_BOOK not in seen:
        fail(f"sample book missing from catalog: {DEFAULT_SAMPLE_BOOK}")
    return data


def validate_default_contract(require_sample: bool = False) -> None:
    for schema in [
        REPO_ROOT / "content" / "schemas" / "agent-import-request.schema.json",
        REPO_ROOT / "content" / "schemas" / "book-package.schema.json",
    ]:
        load_json(schema)
    request = validate_request(DEFAULT_REQUEST)
    validate_book_package(REPO_ROOT / request["conversionPlan"]["outputContentPath"], DEFAULT_PUBLIC_ROOT)
    processed = validate_catalog(DEFAULT_PROCESSED_CATALOG, DEFAULT_PUBLIC_ROOT, require_sample=require_sample)
    public = validate_catalog(DEFAULT_PUBLIC_CATALOG, DEFAULT_PUBLIC_ROOT, require_sample=require_sample)
    processed_books = [(book["bookId"], book["contentPath"]) for book in processed["books"]]
    public_books = [(book["bookId"], book["contentPath"]) for book in public["books"]]
    if processed_books != public_books:
        fail("processed catalog and public catalog disagree on book order/content paths")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate Agent textbook import contracts and runtime book packages.")
    subparsers = parser.add_subparsers(dest="command")

    validate_parser = subparsers.add_parser("validate", help="validate the committed import request and catalogs")
    validate_parser.add_argument("--require-sample", action="store_true", help="require agent-import-sample in catalogs")

    sample_parser = subparsers.add_parser("sample", help="validate the committed sample import fixture")
    sample_parser.add_argument("--request", type=Path, default=DEFAULT_REQUEST)

    args = parser.parse_args()
    command = args.command or "validate"

    try:
        if command == "sample":
            if args.request != DEFAULT_REQUEST:
                validate_request(args.request)
            validate_default_contract(require_sample=True)
            print(f"ok: sample import fixture validated ({DEFAULT_SAMPLE_BOOK})")
        else:
            validate_default_contract(require_sample=getattr(args, "require_sample", False))
            print("ok: Agent import contract and book catalogs validated")
    except ContractError as exc:
        print(f"book import contract validation failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
