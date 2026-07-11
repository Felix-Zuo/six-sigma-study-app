"""Content fidelity baseline audit for the Six Sigma manual package.

Reads content/processed/manual.json and reports, per chapter and for the whole
book, bilingual block statistics plus heuristic *candidate* findings:

- flattened English tables (heading/paragraph runs that look like table rows)
- EN/ZH table and image count divergence
- EN/ZH number / percent / currency / sigma symbol divergence
- ZH blocks that look untranslated or contain heavy English residue
- structural problems (missing page anchors, broken image references)

Every heuristic result is a CANDIDATE that requires human review. The script
never marks anything as a confirmed translation error.

Exit codes:
  0  audit completed (candidate findings are expected at this baseline stage)
  1  structural failure: manual.json unparseable/missing, chapter set
     incomplete or out of order, or duplicate section/block IDs

Usage:
  python scripts/qa_content_fidelity.py [--manual PATH] [--json PATH] [--max-list N]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANUAL = REPO_ROOT / "content" / "processed" / "manual.json"
PUBLIC_CONTENT_ROOT = REPO_ROOT / "apps" / "reader" / "public" / "content"

EXPECTED_CHAPTERS = 33
BLOCK_KINDS = ["paragraph", "heading", "listItem", "table", "image", "termNote"]
TEXT_KINDS = {"paragraph", "heading", "listItem", "table", "termNote"}

NUM_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")


def structural_fail(message: str) -> None:
    print(f"content fidelity audit FAILED (structural): {message}")
    raise SystemExit(1)


# ---------------------------------------------------------------------------
# text helpers


def block_text(block: dict) -> str:
    if block.get("kind") == "table":
        rows = block.get("rows") or []
        cell_text = " ".join(str(cell) for row in rows for cell in row)
        return cell_text or str(block.get("text", ""))
    return str(block.get("text", ""))


def count_cjk(text: str) -> int:
    return sum(1 for ch in text if "一" <= ch <= "鿿")


def count_latin(text: str) -> int:
    return sum(1 for ch in text if ch.isascii() and ch.isalpha())


def numbers_of(text: str) -> Counter:
    return Counter(match.replace(",", "") for match in NUM_RE.findall(text))


def symbol_profile(text: str) -> dict:
    return {
        "numbers": numbers_of(text),
        "percent": text.count("%") + text.count("％"),
        "currency": sum(text.count(symbol) for symbol in ("$", "¥", "￥", "€", "£")),
        "sigma": text.count("σ") + text.count("Σ"),
    }


def multiset_diff(a: Counter, b: Counter) -> int:
    return sum(abs(a[key] - b[key]) for key in set(a) | set(b))


def clip(text: str, limit: int = 70) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


# ---------------------------------------------------------------------------
# flattened-table heuristics (English stream)


def looks_tableish(block: dict) -> str | None:
    """Classify a block as a possible fragment of a flattened table."""
    kind = block.get("kind")
    text = block_text(block)
    words = text.split()
    if kind == "heading":
        # real section headings are consumed as section anchors; short leftover
        # headings inside body content often come from table header cells
        return "header" if 0 < len(words) <= 10 else None
    if kind in ("paragraph", "listItem"):
        numeric_tokens = len(NUM_RE.findall(text))
        digits = sum(ch.isdigit() for ch in text)
        alnum = sum(ch.isalnum() for ch in text)
        density = digits / max(1, alnum)
        if numeric_tokens >= 2 and (density > 0.25 or len(words) <= 10):
            return "numeric-row"
        if len(words) <= 8 and numeric_tokens >= 1 and ("σ" in text or "$" in text or "%" in text):
            return "caption"
    return None


def find_flattened_table_runs(blocks: list[dict]) -> list[dict]:
    """Group consecutive table-ish English blocks into candidate runs.

    A single short non-matching block is tolerated inside a run so that
    wrapped table cells (e.g. a header split across two paragraphs) do not
    break the sequence.
    """
    runs: list[dict] = []
    current: list[tuple[dict, str]] = []
    gap_used = False

    def flush() -> None:
        nonlocal current, gap_used
        members = [(blk, role) for blk, role in current if role != "gap"]
        if len(members) >= 3:
            headers = sum(1 for _b, role in members if role == "header")
            numeric = sum(1 for _b, role in members if role == "numeric-row")
            texts = [" ".join(block_text(blk).split()).lower() for blk, _r in members]
            repeated = sorted({t for t in texts if texts.count(t) >= 2})
            if (headers >= 1 and numeric >= 1) or numeric >= 3 or repeated:
                pages = [blk.get("page") for blk, _r in current if isinstance(blk.get("page"), int)]
                runs.append(
                    {
                        "blockIds": [blk.get("id") for blk, _r in current],
                        "pages": sorted(set(pages)),
                        "headerBlocks": headers,
                        "numericRowBlocks": numeric,
                        "repeatedTexts": repeated,
                        "sample": clip(" | ".join(block_text(blk) for blk, _r in current[:4]), 160),
                    }
                )
        current = []
        gap_used = False

    for block in blocks:
        role = looks_tableish(block)
        if role:
            current.append((block, role))
        elif current and not gap_used and block.get("kind") != "image" and len(block_text(block).split()) <= 6:
            current.append((block, "gap"))
            gap_used = True
        else:
            flush()
    flush()
    return runs


# ---------------------------------------------------------------------------
# audit


def audit(manual_path: Path) -> dict:
    if not manual_path.exists():
        structural_fail(f"manual package not found: {manual_path}")
    try:
        data = json.loads(manual_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        structural_fail(f"manual.json could not be parsed: {error}")

    chapters = data.get("chapters")
    if not isinstance(chapters, list):
        structural_fail("manual.json has no chapters array")
    numbers = [chapter.get("chapter") for chapter in chapters]
    if numbers != list(range(1, EXPECTED_CHAPTERS + 1)):
        structural_fail(
            f"chapter set incomplete or out of order: expected 1..{EXPECTED_CHAPTERS}, got {numbers}"
        )

    seen_section_ids: set[str] = set()
    seen_block_ids: set[str] = set()
    duplicate_ids: list[str] = []

    findings: list[dict] = []  # {priority, category, chapter, where, detail}
    chapter_stats: list[dict] = []

    def add(priority: str, category: str, chapter: int, where: str, detail: str) -> None:
        findings.append(
            {"priority": priority, "category": category, "chapter": chapter, "where": where, "detail": detail}
        )

    for chapter in chapters:
        ch_num = int(chapter["chapter"])
        kind_counts = {lang: Counter() for lang in ("en", "zh")}
        symbol_texts = {"en": [], "zh": []}
        asset_ids = {asset.get("id") for asset in chapter.get("assets", [])}

        for section in chapter.get("sections", []):
            section_id = str(section.get("id"))
            if section_id in seen_section_ids:
                duplicate_ids.append(f"section:{section_id}")
            seen_section_ids.add(section_id)
            title = section.get("title") or {}
            if not title.get("en") or not title.get("zh"):
                add("P1", "structure", ch_num, section_id, "section is missing a bilingual title")

            section_symbols = {}
            for lang in ("en", "zh"):
                blocks = (section.get("content") or {}).get(lang) or []
                lang_text_parts: list[str] = []
                for block in blocks:
                    block_id = str(block.get("id"))
                    if block_id in seen_block_ids:
                        duplicate_ids.append(f"block:{block_id}")
                    seen_block_ids.add(block_id)
                    kind = block.get("kind")
                    kind_counts[lang][kind] += 1
                    if "page" not in block:
                        add("P0", "structure", ch_num, block_id, "block is missing a page anchor")
                    if kind == "image":
                        if block.get("assetId") not in asset_ids:
                            add("P0", "structure", ch_num, block_id,
                                f"image references assetId missing from chapter assets: {block.get('assetId')}")
                        src = str(block.get("src", ""))
                        if not src or src.startswith("/") or ".." in Path(src).parts or not (PUBLIC_CONTENT_ROOT / src).exists():
                            add("P0", "structure", ch_num, block_id, f"image asset file missing or unsafe: {src}")
                    else:
                        text = block_text(block)
                        lang_text_parts.append(text)
                        if lang == "zh" and kind in TEXT_KINDS:
                            cjk = count_cjk(text)
                            latin = count_latin(text)
                            if latin >= 20:
                                ratio = latin / (latin + cjk) if (latin + cjk) else 0.0
                                if cjk == 0:
                                    add("P1", "translation", ch_num, block_id,
                                        f"zh block contains no Chinese characters (candidate untranslated): \"{clip(text)}\"")
                                elif ratio > 0.6 and kind != "termNote":
                                    add("P2", "translation", ch_num, block_id,
                                        f"zh block is {ratio:.0%} English letters (candidate residue): \"{clip(text)}\"")
                        if lang == "en" and count_cjk(text) > 0:
                            add("P1", "translation", ch_num, block_id,
                                f"en block contains Chinese characters (candidate leakage): \"{clip(text)}\"")
                section_symbols[lang] = symbol_profile(" ".join(lang_text_parts))
                symbol_texts[lang].append(" ".join(lang_text_parts))

            # flattened English tables inside this section
            en_blocks = (section.get("content") or {}).get("en") or []
            zh_blocks = (section.get("content") or {}).get("zh") or []
            zh_table_pages = {
                blk.get("page") for blk in zh_blocks if blk.get("kind") == "table" and isinstance(blk.get("page"), int)
            }
            en_has_table = any(blk.get("kind") == "table" for blk in en_blocks)
            for run in find_flattened_table_runs(en_blocks):
                near_zh_table = any(
                    any(abs(page - zh_page) <= 1 for page in run["pages"]) for zh_page in zh_table_pages
                )
                if near_zh_table and not en_has_table:
                    priority = "P0"  # zh kept a semantic table, en flattened the same content
                elif run["numericRowBlocks"] >= 2 and (run["headerBlocks"] >= 1 or run["repeatedTexts"]):
                    priority = "P1"
                else:
                    priority = "P2"
                repeated = f"; repeated texts: {run['repeatedTexts']}" if run["repeatedTexts"] else ""
                add(priority, "table-flattening", ch_num,
                    f"{section_id} blocks {run['blockIds'][0]}..{run['blockIds'][-1]} pages {run['pages']}",
                    f"{len(run['blockIds'])} blocks ({run['headerBlocks']} header-like, "
                    f"{run['numericRowBlocks']} numeric rows){repeated}; sample: \"{run['sample']}\"")

            # per-section symbol divergence
            en_sym, zh_sym = section_symbols["en"], section_symbols["zh"]
            num_diff = multiset_diff(en_sym["numbers"], zh_sym["numbers"])
            num_total = sum(en_sym["numbers"].values()) + sum(zh_sym["numbers"].values())
            sigma_diff = abs(en_sym["sigma"] - zh_sym["sigma"])
            percent_diff = abs(en_sym["percent"] - zh_sym["percent"])
            currency_diff = abs(en_sym["currency"] - zh_sym["currency"])
            details = []
            if num_total and num_diff >= 8 and num_diff / num_total >= 0.35:
                details.append(f"number tokens differ by {num_diff} of {num_total}")
            if sigma_diff >= 3:
                details.append(f"σ count en={en_sym['sigma']} zh={zh_sym['sigma']}")
            if percent_diff >= 4:
                details.append(f"% count en={en_sym['percent']} zh={zh_sym['percent']}")
            if currency_diff >= 4:
                details.append(f"currency symbols en={en_sym['currency']} zh={zh_sym['currency']}")
            if details:
                severe = sigma_diff >= 5 or (num_total and num_diff / num_total >= 0.6 and num_diff >= 20)
                add("P1" if severe else "P2", "symbols", ch_num, section_id, "; ".join(details))

        # chapter-level EN/ZH kind divergence
        en_counts, zh_counts = kind_counts["en"], kind_counts["zh"]
        table_diff = abs(en_counts["table"] - zh_counts["table"])
        image_diff = abs(en_counts["image"] - zh_counts["image"])
        if table_diff:
            add("P1", "table-count", ch_num, chapter["id"],
                f"table blocks en={en_counts['table']} zh={zh_counts['table']}")
        if image_diff:
            add("P1", "image-count", ch_num, chapter["id"],
                f"image blocks en={en_counts['image']} zh={zh_counts['image']}")

        chapter_stats.append(
            {
                "chapter": ch_num,
                "id": chapter["id"],
                "pageStart": chapter.get("pageStart"),
                "pageEnd": chapter.get("pageEnd"),
                "sections": len(chapter.get("sections", [])),
                "en": {kind: en_counts[kind] for kind in BLOCK_KINDS},
                "zh": {kind: zh_counts[kind] for kind in BLOCK_KINDS},
                "enTotal": sum(en_counts.values()),
                "zhTotal": sum(zh_counts.values()),
            }
        )

    if duplicate_ids:
        structural_fail(f"duplicate IDs detected: {duplicate_ids[:10]}")

    return {"manual": str(manual_path), "chapters": chapter_stats, "findings": findings}


# ---------------------------------------------------------------------------
# reporting


def print_report(result: dict, max_list: int) -> None:
    chapters = result["chapters"]
    findings = result["findings"]
    by_priority = Counter(finding["priority"] for finding in findings)
    by_category = Counter(finding["category"] for finding in findings)

    print("=" * 78)
    print("CONTENT FIDELITY BASELINE AUDIT (heuristic candidates, not confirmed errors)")
    print("=" * 78)
    print(f"manual: {result['manual']}")
    total = {lang: Counter() for lang in ("en", "zh")}
    for chapter in chapters:
        for lang in ("en", "zh"):
            total[lang].update(chapter[lang])
    print(f"chapters: {len(chapters)}  sections: {sum(c['sections'] for c in chapters)}")
    for lang in ("en", "zh"):
        counts = " ".join(f"{kind}={total[lang][kind]}" for kind in BLOCK_KINDS)
        print(f"  {lang} blocks total={sum(total[lang].values())}  {counts}")

    print("\nPER-CHAPTER SUMMARY (enBlocks/zhBlocks, tables en:zh, images en:zh, candidates P0/P1/P2)")
    finding_index: dict[int, Counter] = {}
    for finding in findings:
        finding_index.setdefault(finding["chapter"], Counter())[finding["priority"]] += 1
    for chapter in chapters:
        f = finding_index.get(chapter["chapter"], Counter())
        print(
            f"  ch{chapter['chapter']:02d} pages {chapter['pageStart']}-{chapter['pageEnd']:<3} "
            f"blocks {chapter['enTotal']:>3}/{chapter['zhTotal']:<3} "
            f"tables {chapter['en']['table']}:{chapter['zh']['table']} "
            f"images {chapter['en']['image']:>2}:{chapter['zh']['image']:<2} "
            f"candidates {f['P0']}/{f['P1']}/{f['P2']}"
        )

    print(f"\nCANDIDATE FINDINGS: total={len(findings)}  "
          f"P0={by_priority['P0']}  P1={by_priority['P1']}  P2={by_priority['P2']}")
    print("  by category: " + "  ".join(f"{cat}={count}" for cat, count in sorted(by_category.items())))

    order = {"P0": 0, "P1": 1, "P2": 2}
    for category, label in [
        ("table-flattening", "FLATTENED ENGLISH TABLE CANDIDATES"),
        ("table-count", "EN/ZH TABLE COUNT DIVERGENCE"),
        ("image-count", "EN/ZH IMAGE COUNT DIVERGENCE"),
        ("symbols", "NUMBER/SYMBOL DIVERGENCE CANDIDATES"),
        ("translation", "TRANSLATION RESIDUE / UNTRANSLATED CANDIDATES"),
        ("structure", "STRUCTURAL PROBLEMS"),
    ]:
        rows = sorted(
            (finding for finding in findings if finding["category"] == category),
            key=lambda finding: (order[finding["priority"]], finding["chapter"]),
        )
        print(f"\n{label}: {len(rows)}")
        for finding in rows[:max_list]:
            print(f"  [{finding['priority']}] ch{finding['chapter']:02d} {finding['where']}: {finding['detail']}")
        if len(rows) > max_list:
            print(f"  ... and {len(rows) - max_list} more (rerun with --max-list or --json for the full list)")

    print("\nSUGGESTED CHAPTER REPAIR ORDER (severity score = 10*P0 + 3*P1 + 1*P2):")
    scored = sorted(
        ((10 * f["P0"] + 3 * f["P1"] + f["P2"], ch) for ch, f in finding_index.items()),
        key=lambda item: (-item[0], item[1]),
    )
    for rank, (score, ch) in enumerate(scored[:10], start=1):
        print(f"  {rank}. ch{ch:02d} (score {score})")
    if len(scored) > 10:
        print(f"  ... remaining chapters in descending score order: "
              + ", ".join(f"ch{ch:02d}" for _s, ch in scored[10:]))

    print("\nNOTE: every finding above is a heuristic CANDIDATE derived from the current")
    print("data. Each one must be human-reviewed against the source manual before any")
    print("content change. See docs/09-content-fidelity-baseline.md for methodology.")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
    parser = argparse.ArgumentParser(description="Audit bilingual manual content fidelity (baseline).")
    parser.add_argument("--manual", type=Path, default=DEFAULT_MANUAL)
    parser.add_argument("--json", type=Path, default=None, help="also write the full report as JSON")
    parser.add_argument("--max-list", type=int, default=15, help="max findings listed per category on stdout")
    args = parser.parse_args()

    result = audit(args.manual)
    print_report(result, args.max_list)
    if args.json:
        payload = json.dumps(result, ensure_ascii=False, indent=2)
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(payload, encoding="utf-8")
        print(f"\nok: JSON report written to {args.json}")
    print("\nok: content fidelity baseline audit completed")


if __name__ == "__main__":
    main()
