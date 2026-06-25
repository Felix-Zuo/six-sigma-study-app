from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = REPO_ROOT.parent
DEFAULT_SOURCE_PDF = WORKSPACE_ROOT / "sources" / "source_manual.pdf"
LOCAL_POPPLER_BIN = (
    WORKSPACE_ROOT / "tools" / "findjob_sixsigma_tools" / "poppler" / "Library" / "bin"
)
BUNDLED_POPPLER_BIN = (
    Path.home()
    / ".cache"
    / "codex-runtimes"
    / "codex-primary-runtime"
    / "dependencies"
    / "native"
    / "poppler"
    / "Library"
    / "bin"
)
EXPECTED_CHAPTERS = 33
EXPECTED_TARGET_PAGES = 449
EXPECTED_FIRST_STUDY_PAGE = 6
EXPECTED_SOURCE_PAGES = 557
EXPECTED_SOURCE_AFTER_LAST = 558
EXPECTED_ASSETS = 470

KNOWN_UNMATCHED_SOURCE_SECTIONS = {
    (4, "5S"),
    (5, "Voice of the Customer"),
    (6, "Problem Functions: y = f(x)"),
    (6, "The 5 Whys"),
    (7, "Data"),
    (11, "Breaking up the Elephant"),
    (24, "Why Include Some Statistics?"),
    (28, "Preparing for a 1-Way ANOVA"),
    (28, "Running a 1-Way ANOVA"),
    (29, "Why Run an Experiment?"),
    (29, "What is Factorial Experimentation?"),
    (29, "Step-by-Step Guide for Creating a Designed Experiment"),
    (29, "Step-by-Step Guide to Running a 2k Factorial Experiment in Minitab"),
    (30, "2k Factorials Versus Multi-Level Factorials"),
    (33, "What Do You Do with Value Stream Maps?"),
}


def fail(message: str) -> None:
    raise SystemExit(f"source coverage QA failed: {message}")


def read_json(path: Path) -> Any:
    if not path.exists():
        fail(f"missing JSON file: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_title(value: str) -> str:
    value = value.lower().replace("蟽", "sigma")
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def find_poppler_binary(name: str, override: Path | None = None) -> Path:
    candidates: list[Path] = []
    if override:
        candidates.append(override / name)
    candidates.extend([LOCAL_POPPLER_BIN / name, BUNDLED_POPPLER_BIN / name])
    found = shutil.which(name)
    if found:
        candidates.append(Path(found))
    for candidate in candidates:
        if candidate.exists():
            return candidate
    fail(f"could not find {name}; expected local Poppler under {LOCAL_POPPLER_BIN}")


def run_tool(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=False, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def pdf_page_count(pdfinfo: Path, source_pdf: Path) -> int:
    result = run_tool([str(pdfinfo), str(source_pdf)])
    output = f"{result.stdout}\n{result.stderr}"
    match = re.search(r"^Pages:\s+(\d+)\s*$", output, flags=re.MULTILINE)
    if not match:
        fail(f"could not read source PDF page count with {pdfinfo}: {output[:400]}")
    return int(match.group(1))


def ppm_nonwhite_ratio(path: Path) -> float:
    data = path.read_bytes()
    index = 0

    def read_token() -> bytes:
        nonlocal index
        while index < len(data) and data[index] in b" \t\r\n":
            index += 1
        if index < len(data) and data[index] == ord("#"):
            while index < len(data) and data[index] not in b"\r\n":
                index += 1
            return read_token()
        start = index
        while index < len(data) and data[index] not in b" \t\r\n":
            index += 1
        return data[start:index]

    magic = read_token()
    if magic != b"P6":
        fail(f"rendered sample is not a binary PPM: {path}")
    width = int(read_token())
    height = int(read_token())
    max_value = int(read_token())
    if max_value > 255:
        fail(f"rendered sample has unsupported max value {max_value}: {path}")
    if index < len(data) and data[index] in b" \t\r\n":
        index += 1
    pixels = data[index:]
    if len(pixels) < width * height * 3:
        fail(f"rendered sample is truncated: {path}")
    stride = max(1, (width * height) // 25000)
    samples = 0
    nonwhite = 0
    for pixel_index in range(0, width * height, stride):
        offset = pixel_index * 3
        red, green, blue = pixels[offset], pixels[offset + 1], pixels[offset + 2]
        samples += 1
        if min(red, green, blue) < 245:
            nonwhite += 1
    return nonwhite / max(samples, 1)


def render_source_samples(pdftoppm: Path, source_pdf: Path, sample_pages: list[int], output_dir: Path) -> dict[int, float]:
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    ratios: dict[int, float] = {}
    for page in sample_pages:
        prefix = output_dir / f"source-page-{page}"
        result = run_tool([
            str(pdftoppm),
            "-f",
            str(page),
            "-l",
            str(page),
            "-r",
            "36",
            str(source_pdf),
            str(prefix),
        ])
        ppm_files = sorted(output_dir.glob(f"{prefix.name}-*.ppm"))
        if not ppm_files:
            fail(f"pdftoppm did not render source page {page}: {result.stderr[:400]}")
        ratio = ppm_nonwhite_ratio(ppm_files[0])
        if ratio < 0.01:
            fail(f"rendered source page {page} appears blank: nonwhite ratio {ratio:.4f}")
        ratios[page] = ratio
    return ratios


def mapped_source_page(
    source_page: int,
    source_start: int,
    source_next: int,
    target_start: int,
    target_next: int,
) -> int:
    if source_next <= source_start or target_next <= target_start:
        return target_start
    ratio = (source_page - source_start) / (source_next - source_start)
    mapped = target_start + int((target_next - target_start) * ratio + 0.5)
    return max(target_start, min(target_next - 1, mapped))


def validate_manual_coverage(manual: dict[str, Any]) -> tuple[int, int]:
    if manual.get("pageCount") != EXPECTED_TARGET_PAGES:
        fail(f"manual pageCount must be {EXPECTED_TARGET_PAGES}: {manual.get('pageCount')}")
    chapters = manual.get("chapters")
    if not isinstance(chapters, list) or len(chapters) != EXPECTED_CHAPTERS:
        fail(f"manual must contain {EXPECTED_CHAPTERS} chapters")
    previous_end = EXPECTED_FIRST_STUDY_PAGE - 1
    block_count = 0
    image_count = 0
    for expected_chapter, chapter in enumerate(chapters, start=1):
        if chapter.get("chapter") != expected_chapter:
            fail(f"chapter sequence mismatch: expected {expected_chapter}, got {chapter.get('chapter')}")
        if chapter.get("pageStart") != previous_end + 1:
            fail(f"page range gap before chapter {chapter.get('chapter')}")
        previous_end = chapter["pageEnd"]
        expected_pages = set(range(chapter["pageStart"], chapter["pageEnd"] + 1))
        for language in ("en", "zh"):
            covered_pages: set[int] = set()
            for section in chapter.get("sections", []):
                last_page = section["page"]
                for block in section.get("content", {}).get(language, []):
                    block_count += 1
                    if "page" not in block:
                        fail(f"block missing page anchor: {block.get('id')}")
                    page = block["page"]
                    if not isinstance(page, int) or page not in expected_pages:
                        fail(f"block page outside chapter range: {block.get('id')} page {page}")
                    if page < last_page:
                        fail(f"block pages must be nondecreasing in section {section['id']} ({language})")
                    last_page = page
                    covered_pages.add(page)
                    if block.get("kind") == "image":
                        image_count += 1
            missing = sorted(expected_pages - covered_pages)
            if missing:
                fail(f"chapter {chapter['chapter']} missing {language} page coverage: {missing[:12]}")
    if previous_end != EXPECTED_TARGET_PAGES:
        fail(f"manual final page must be {EXPECTED_TARGET_PAGES}: {previous_end}")
    return block_count, image_count


def validate_asset_manifest(manual: dict[str, Any], asset_manifest: dict[str, Any], repo_root: Path) -> int:
    manifest_assets = asset_manifest.get("assets")
    if asset_manifest.get("assetCount") != EXPECTED_ASSETS or not isinstance(manifest_assets, list):
        fail(f"asset manifest must contain {EXPECTED_ASSETS} assets")
    manifest_by_id = {asset["id"]: asset for asset in manifest_assets}
    if len(manifest_by_id) != EXPECTED_ASSETS:
        fail("asset manifest contains duplicate asset ids")
    chapter_assets: dict[str, dict[str, Any]] = {}
    image_asset_ids: set[str] = set()
    for chapter in manual["chapters"]:
        for asset in chapter.get("assets", []):
            chapter_assets[asset["id"]] = asset
        for section in chapter["sections"]:
            for language in ("en", "zh"):
                for block in section["content"][language]:
                    if block.get("kind") == "image":
                        image_asset_ids.add(block["assetId"])
    if set(manifest_by_id) != set(chapter_assets):
        fail("asset manifest ids do not match chapter asset metadata")
    if set(chapter_assets) != image_asset_ids:
        fail("chapter asset metadata does not match image block references")
    public_content_root = repo_root / "apps" / "reader" / "public" / "content"
    for asset in manifest_assets:
        path = public_content_root / asset["path"]
        if not path.exists() or path.stat().st_size <= 0:
            fail(f"asset file missing or empty: {path}")
        if asset.get("bytes") != path.stat().st_size:
            fail(f"asset byte count mismatch for {asset['id']}")
    return len(manifest_assets)


def validate_source_toc(source_toc: dict[str, Any], manual: dict[str, Any]) -> tuple[int, int, int]:
    if source_toc.get("sourcePageAfterLast") != EXPECTED_SOURCE_AFTER_LAST:
        fail(f"sourcePageAfterLast must be {EXPECTED_SOURCE_AFTER_LAST}")
    source_chapters = source_toc.get("chapters")
    if not isinstance(source_chapters, list) or len(source_chapters) != EXPECTED_CHAPTERS:
        fail(f"source TOC must contain {EXPECTED_CHAPTERS} chapters")
    unmatched: set[tuple[int, str]] = set()
    matched = 0
    source_sections = 0
    for index, source_chapter in enumerate(source_chapters):
        chapter_number = source_chapter["chapter"]
        manual_chapter = manual["chapters"][chapter_number - 1]
        next_source_page = (
            source_chapters[index + 1]["sourcePage"]
            if index + 1 < len(source_chapters)
            else source_toc["sourcePageAfterLast"]
        )
        next_target_page = (
            manual["chapters"][chapter_number]["pageStart"]
            if chapter_number < len(manual["chapters"])
            else EXPECTED_TARGET_PAGES + 1
        )
        if not normalize_title(source_chapter["title"]).split()[:2]:
            fail(f"source chapter title is empty: {chapter_number}")
        manual_titles = [normalize_title(section["title"]["en"]) for section in manual_chapter["sections"]]
        for section in source_chapter.get("sections", []):
            source_sections += 1
            mapped_page = mapped_source_page(
                int(section["sourcePage"]),
                int(source_chapter["sourcePage"]),
                int(next_source_page),
                int(manual_chapter["pageStart"]),
                int(next_target_page),
            )
            if not (manual_chapter["pageStart"] <= mapped_page <= manual_chapter["pageEnd"]):
                fail(f"mapped source page outside target range: chapter {chapter_number} {section['title']}")
            normalized = normalize_title(section["title"])
            if any(normalized in title or title in normalized for title in manual_titles):
                matched += 1
            else:
                unmatched.add((chapter_number, section["title"]))
    unexpected = sorted(unmatched - KNOWN_UNMATCHED_SOURCE_SECTIONS)
    if unexpected:
        fail(f"unexpected unmatched source sections: {unexpected[:10]}")
    return source_sections, matched, len(unmatched)


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate source PDF, TOC, generated page anchors, and asset coverage.")
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT)
    parser.add_argument("--source-pdf", type=Path, default=DEFAULT_SOURCE_PDF)
    parser.add_argument("--poppler-bin", type=Path, default=None)
    parser.add_argument("--render-output", type=Path, default=REPO_ROOT / "qa" / "source-coverage")
    args = parser.parse_args()

    repo_root = args.repo_root.resolve()
    source_pdf = args.source_pdf
    if not source_pdf.exists():
        fail(f"source PDF not found: {source_pdf}")

    manual = read_json(repo_root / "content" / "processed" / "manual.json")
    manifest = read_json(repo_root / "content" / "processed" / "manifest.json")
    source_toc = read_json(repo_root / "content" / "source" / "source_toc_sections.json")
    asset_manifest = read_json(repo_root / "apps" / "reader" / "public" / "content" / "assets" / "asset-manifest.json")

    pdfinfo = find_poppler_binary("pdfinfo.exe", args.poppler_bin)
    pdftoppm = find_poppler_binary("pdftoppm.exe", args.poppler_bin)
    pages = pdf_page_count(pdfinfo, source_pdf)
    if pages != EXPECTED_SOURCE_PAGES:
        fail(f"source PDF must have {EXPECTED_SOURCE_PAGES} pages: {pages}")

    if manifest.get("pageCount") != manual.get("pageCount"):
        fail("manifest and manual page counts differ")

    block_count, image_block_count = validate_manual_coverage(manual)
    asset_count = validate_asset_manifest(manual, asset_manifest, repo_root)
    source_section_count, source_section_matches, allowed_unmatched = validate_source_toc(source_toc, manual)

    last_source_chapter = source_toc["chapters"][-1]
    last_content_page = last_source_chapter["sections"][-1]["sourcePage"]
    sample_pages = [
        source_toc["chapters"][0]["sourcePage"],
        source_toc["chapters"][6]["sourcePage"],
        source_toc["chapters"][25]["sourcePage"],
        source_toc["chapters"][32]["sourcePage"],
        last_content_page,
    ]
    render_ratios = render_source_samples(pdftoppm, source_pdf, sample_pages, args.render_output)

    print("ok: source coverage QA passed")
    print(f"sourcePdfPages={pages}")
    print(f"manualPages={manual['pageCount']}")
    print(f"chapters={len(manual['chapters'])}")
    print(f"contentBlocks={block_count}")
    print(f"imageBlocks={image_block_count}")
    print(f"assets={asset_count}")
    print(f"sourceTocSections={source_section_count}")
    print(f"sourceTocMatchedSections={source_section_matches}")
    print(f"allowedUnmatchedSourceSections={allowed_unmatched}")
    print("renderedSourceSamples=" + ",".join(f"{page}:{ratio:.4f}" for page, ratio in render_ratios.items()))


if __name__ == "__main__":
    main()
