from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

try:
    from pypdf import PdfReader
except ImportError as exc:  # pragma: no cover - local tooling guard
    raise SystemExit(
        "pypdf is required for source TOC extraction. Use the bundled Codex Python "
        "runtime or install pypdf in the active Python environment."
    ) from exc


DEFAULT_REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKSPACE_ROOT = DEFAULT_REPO_ROOT.parent
DEFAULT_SOURCE_PDF = DEFAULT_WORKSPACE_ROOT / "sources" / "source_manual.pdf"
TOC_LINE_RE = re.compile(r"^(?P<title>.+?)\s*\.{3,}\s*(?P<page>\d+)$")
CHAPTER_RE = re.compile(r"^CHAPTER\s+(?P<number>\d+)\s*:\s*(?P<title>.+)$", re.IGNORECASE)


def normalize_space(text: str) -> str:
    return " ".join(text.replace("\u00a0", " ").split()).strip()


def extract_toc_lines(pdf_path: Path, first_page: int, last_page: int) -> list[str]:
    reader = PdfReader(str(pdf_path))
    if reader.is_encrypted:
        reader.decrypt("")

    lines: list[str] = []
    for page_index in range(first_page - 1, last_page):
        text = reader.pages[page_index].extract_text() or ""
        for raw_line in text.splitlines():
            line = normalize_space(raw_line)
            if not line:
                continue
            if line.startswith("Page |") or line.startswith("© "):
                continue
            lines.append(line)
    return lines


def parse_toc(lines: list[str]) -> dict[str, Any]:
    chapters: list[dict[str, Any]] = []
    current_chapter: dict[str, Any] | None = None

    for line in lines:
        if line == "Table of Contents":
            continue

        match = TOC_LINE_RE.match(line)
        if not match:
            continue

        title = normalize_space(match.group("title"))
        page = int(match.group("page"))

        if title.upper().startswith("UNIT "):
            continue

        chapter_match = CHAPTER_RE.match(title)
        if chapter_match:
            current_chapter = {
                "chapter": int(chapter_match.group("number")),
                "title": normalize_space(chapter_match.group("title")).title(),
                "sourcePage": page,
                "sections": [],
            }
            chapters.append(current_chapter)
            continue

        if current_chapter is None:
            continue
        current_chapter["sections"].append({"title": title, "sourcePage": page})

    if len(chapters) != 33:
        raise RuntimeError(f"Expected 33 chapters in source TOC, found {len(chapters)}")

    return {
        "source": "CSSC Six Sigma Black Belt Certification Training Manual source PDF table of contents",
        "sourceDocument": "local public-manual PDF, not committed",
        "sourcePageAfterLast": 558,
        "chapters": chapters,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract source PDF table-of-contents section metadata.")
    parser.add_argument("--source-pdf", type=Path, default=DEFAULT_SOURCE_PDF)
    parser.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT)
    parser.add_argument("--first-page", type=int, default=4)
    parser.add_argument("--last-page", type=int, default=7)
    args = parser.parse_args()

    toc = parse_toc(extract_toc_lines(args.source_pdf, args.first_page, args.last_page))
    output_path = args.repo_root / "content" / "source" / "source_toc_sections.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(toc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    section_count = sum(len(chapter["sections"]) for chapter in toc["chapters"])
    print(f"ok: extracted {len(toc['chapters'])} source chapters and {section_count} source sections")


if __name__ == "__main__":
    main()
