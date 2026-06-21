from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path
from typing import Any

from docx import Document

from extract_chapter_content import (
    CURATED_TERMS,
    DEFAULT_EN_DOCX,
    DEFAULT_REPO_ROOT,
    DEFAULT_ZH_DOCX,
    build_lesson,
    iter_doc_items,
    normalize_heading_item,
    serialize_block,
    write_json,
)


CN_NUMERALS = [
    "一",
    "二",
    "三",
    "四",
    "五",
    "六",
    "七",
    "八",
    "九",
    "十",
    "十一",
    "十二",
    "十三",
    "十四",
    "十五",
    "十六",
    "十七",
    "十八",
    "十九",
    "二十",
    "二十一",
    "二十二",
    "二十三",
    "二十四",
    "二十五",
    "二十六",
    "二十七",
    "二十八",
    "二十九",
    "三十",
    "三十一",
    "三十二",
    "三十三",
]


def cell_text(row: Any, index: int) -> str:
    return " ".join(row.cells[index].text.split()) if len(row.cells) > index else ""


def chapter_number(label: str) -> int | None:
    match = re.search(r"(\d+)", label)
    if match:
        return int(match.group(1))
    return None


def parse_toc(docx_path: Path, lang: str) -> list[dict[str, Any]]:
    doc = Document(str(docx_path))
    chapters: list[dict[str, Any]] = []
    for row in doc.tables[0].rows:
        label = cell_text(row, 0)
        title = cell_text(row, 1)
        page_text = cell_text(row, 2)
        if lang == "en" and not label.startswith("Chapter "):
            continue
        if lang == "zh" and not label.startswith("第 "):
            continue
        number = chapter_number(label)
        if not number:
            continue
        chapters.append(
            {
                "chapter": number,
                "label": label,
                "title": title,
                "pageStart": int(page_text),
            }
        )
    return chapters


def find_starts(items: list[dict[str, Any]], chapters: list[dict[str, Any]], lang: str) -> dict[int, int]:
    starts: dict[int, int] = {}
    for chapter in chapters:
        number = chapter["chapter"]
        title = chapter["title"]
        for index, item in enumerate(items):
            text = item.get("text", "")
            style = item.get("style", "")
            if item.get("kind") != "paragraph" or not style.startswith("Heading"):
                continue
            if lang == "en" and f"Chapter {number}:" in text:
                starts[number] = index
                break
            if lang == "zh":
                if "内部目录" in text:
                    continue
                cn = CN_NUMERALS[number - 1]
                prefixes = (f"第 {number} 章", f"第{number}章", f"第{cn}章")
                if any(prefix in text for prefix in prefixes):
                    starts[number] = index
                    break
        if number not in starts:
            raise RuntimeError(f"Could not find {lang} start for chapter {number}: {title}")
    return starts


def normalize_items_for_chapter(items: list[dict[str, Any]], lang: str) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for item in items:
        normalized.extend(normalize_heading_item(item, lang))
    return normalized


def generic_chapter(
    chapter: int,
    page_start: int,
    page_end: int,
    en_title: str,
    zh_title: str,
    en_items: list[dict[str, Any]],
    zh_items: list[dict[str, Any]],
    en_docx: Path,
    zh_docx: Path,
) -> dict[str, Any]:
    chapter_id = f"ch{chapter:02d}"
    section_id = f"{chapter_id}-content"
    en_body = normalize_items_for_chapter(en_items[1:], "en")
    zh_body = normalize_items_for_chapter(zh_items[1:], "zh")
    en_blocks = [serialize_block(item, section_id, "en", idx) for idx, item in enumerate(en_body, start=1)]
    zh_blocks = [serialize_block(item, section_id, "zh", idx) for idx, item in enumerate(zh_body, start=1)]
    return {
        "id": chapter_id,
        "chapter": chapter,
        "pageStart": page_start,
        "pageEnd": page_end,
        "title": {
            "en": f"Chapter {chapter}: {en_title}",
            "zh": f"第 {chapter} 章：{zh_title}",
        },
        "source": {
            "enDocx": str(en_docx),
            "zhDocx": str(zh_docx),
            "extraction": "python-docx body-order extraction; generic chapter-level bilingual content",
        },
        "sections": [
            {
                "id": section_id,
                "level": 1,
                "page": page_start,
                "title": {
                    "en": en_title,
                    "zh": zh_title,
                },
                "content": {
                    "en": en_blocks,
                    "zh": zh_blocks,
                },
            }
        ],
    }


def build_manual(en_docx: Path, zh_docx: Path) -> dict[str, Any]:
    en_chapters = parse_toc(en_docx, "en")
    zh_chapters = parse_toc(zh_docx, "zh")
    if len(en_chapters) != len(zh_chapters):
        raise RuntimeError(f"Chapter TOC mismatch: en={len(en_chapters)}, zh={len(zh_chapters)}")

    en_items = iter_doc_items(Document(str(en_docx)))
    zh_items = iter_doc_items(Document(str(zh_docx)))
    en_starts = find_starts(en_items, en_chapters, "en")
    zh_starts = find_starts(zh_items, zh_chapters, "zh")

    lessons: list[dict[str, Any]] = []
    for index, (en_chapter, zh_chapter) in enumerate(zip(en_chapters, zh_chapters)):
        chapter = en_chapter["chapter"]
        if chapter != zh_chapter["chapter"]:
            raise RuntimeError(f"Chapter number mismatch: {chapter} vs {zh_chapter['chapter']}")
        page_start = int(en_chapter["pageStart"])
        next_page = int(en_chapters[index + 1]["pageStart"]) if index + 1 < len(en_chapters) else 450
        page_end = next_page - 1
        if chapter == 1:
            lesson = build_lesson(en_docx, zh_docx)
        else:
            en_start = en_starts[chapter]
            zh_start = zh_starts[chapter]
            next_chapter = chapter + 1
            en_end = en_starts.get(next_chapter, len(en_items))
            zh_end = zh_starts.get(next_chapter, len(zh_items))
            lesson = generic_chapter(
                chapter,
                page_start,
                page_end,
                en_chapter["title"],
                zh_chapter["title"],
                en_items[en_start:en_end],
                zh_items[zh_start:zh_end],
                en_docx,
                zh_docx,
            )
        lessons.append(lesson)

    return {
        "manual": "CSSC Six Sigma Black Belt Training Manual",
        "version": "0.2.0",
        "pageCount": 449,
        "chapters": lessons,
        "dictionary": CURATED_TERMS,
    }


def write_outputs(repo_root: Path, manual: dict[str, Any]) -> None:
    processed_dir = repo_root / "content" / "processed"
    chapters_dir = processed_dir / "chapters"
    chapters_dir.mkdir(parents=True, exist_ok=True)

    for chapter in manual["chapters"]:
        write_json(chapters_dir / f"{chapter['id']}.json", chapter)

    manifest = {
        "manual": manual["manual"],
        "version": manual["version"],
        "pageCount": manual["pageCount"],
        "chapters": [
            {
                "id": chapter["id"],
                "chapter": chapter["chapter"],
                "title": chapter["title"],
                "pageStart": chapter["pageStart"],
                "pageEnd": chapter["pageEnd"],
                "path": f"chapters/{chapter['id']}.json",
            }
            for chapter in manual["chapters"]
        ],
        "dictionary": "dictionary/six-sigma-terms.json",
    }
    write_json(processed_dir / "dictionary" / "six-sigma-terms.json", manual["dictionary"])
    write_json(processed_dir / "manifest.json", manifest)
    write_json(processed_dir / "manual.json", manual)

    generated_dir = repo_root / "apps" / "reader" / "src" / "generated"
    generated_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(processed_dir / "dictionary" / "six-sigma-terms.json", generated_dir / "six-sigma-terms.json")

    public_content_dir = repo_root / "apps" / "reader" / "public" / "content"
    public_content_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(processed_dir / "manual.json", public_content_dir / "manual.json")


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract the full bilingual manual into app JSON.")
    parser.add_argument("--en-docx", type=Path, default=DEFAULT_EN_DOCX)
    parser.add_argument("--zh-docx", type=Path, default=DEFAULT_ZH_DOCX)
    parser.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT)
    args = parser.parse_args()
    manual = build_manual(args.en_docx, args.zh_docx)
    write_outputs(args.repo_root, manual)
    chapters = manual["chapters"]
    en_blocks = sum(len(section["content"]["en"]) for lesson in chapters for section in lesson["sections"])
    zh_blocks = sum(len(section["content"]["zh"]) for lesson in chapters for section in lesson["sections"])
    print(f"ok: extracted {len(chapters)} chapters, {en_blocks} English blocks, {zh_blocks} Chinese blocks")


if __name__ == "__main__":
    main()
