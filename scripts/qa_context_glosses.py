from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
MANUAL_PATH = REPO_ROOT / "apps" / "reader" / "public" / "content" / "manual.json"
APP_PATH = REPO_ROOT / "apps" / "reader" / "src" / "App.tsx"
CONTEXT_PATH = REPO_ROOT / "apps" / "reader" / "src" / "lib" / "contextLookup.ts"
TEXT_KINDS = {"paragraph", "listItem", "table", "heading"}


def block_text(block: dict[str, Any]) -> str:
    return re.sub(r"\s+", " ", str(block.get("text") or "")).strip()


def fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    manual = json.loads(MANUAL_PATH.read_text(encoding="utf-8"))
    glosses = manual.get("contextGlosses")
    if not isinstance(glosses, dict) or not glosses:
        fail("manual has no occurrence-level contextGlosses")

    expected_blocks: list[str] = []
    sentence_count = 0
    meaning_count = 0
    low_confidence_count = 0
    for chapter in manual.get("chapters", []):
        for section in chapter.get("sections", []):
            for block in section.get("content", {}).get("en", []):
                if block.get("kind") in TEXT_KINDS and block_text(block):
                    expected_blocks.append(block["id"])

    missing = [block_id for block_id in expected_blocks if block_id not in glosses]
    if missing:
        fail(f"{len(missing)} English text blocks have no context gloss; first: {missing[:5]}")

    for gloss in glosses.values():
        for sentence in gloss.get("sentences", []):
            sentence_count += 1
            meaning_count += len(sentence.get("meanings", {}))
            if sentence.get("confidence") == "low":
                low_confidence_count += 1

    if sentence_count < 7_000:
        fail(f"sentence coverage too low: {sentence_count}")
    if meaning_count < 80_000:
        fail(f"word-meaning coverage too low: {meaning_count}")
    if low_confidence_count / max(1, sentence_count) > 0.12:
        fail(f"too many low-confidence sentence alignments: {low_confidence_count}/{sentence_count}")

    prospect = glosses.get("calculating-sigma-level-en-003", {})
    prospect_sentences = prospect.get("sentences", [])
    prospect_meanings = [
        sentence.get("meanings", {}).get("prospects")
        for sentence in prospect_sentences
        if "prospects" in sentence.get("meanings", {})
    ]
    if "潜在客户" not in prospect_meanings:
        fail(f"prospects regression: {prospect_meanings}")
    if "潜在客户" not in " ".join(sentence.get("translation", "") for sentence in prospect_sentences):
        fail("prospects example translation is not the matching marketing sentence")

    for block_id in ("sigma-level-not-final-en-001", "sigma-level-not-final-en-002"):
        if block_id not in glosses or not glosses[block_id].get("sentences"):
            fail(f"page 9 regression block missing: {block_id}")
    page9_continuation = glosses["sigma-level-not-final-en-002"]["sentences"][0]
    if page9_continuation.get("meanings", {}).get("should") != "应该":
        fail(f"page 9 cross-block should regression: {page9_continuation.get('meanings', {}).get('should')}")
    if not page9_continuation.get("source", "").endswith("organization should improve first."):
        fail("page 9 cross-block English example is still truncated")

    app = APP_PATH.read_text(encoding="utf-8")
    context = CONTEXT_PATH.read_text(encoding="utf-8")
    if "shouldLazyTokenize" in app or "isNearViewport" in app:
        fail("English word clicks still depend on lazy tokenization state")
    if "firstMeaning(input.dictionaryTranslation)" in context or "在当前句子的具体语境中" in context:
        fail("unverified dictionary-first context fallback is still present")
    if "暂无可靠语境义" not in context or "contextGloss" not in context:
        fail("safe unavailable state or occurrence gloss lookup is missing")
    term_note_renderer = re.search(
        r'if \(block\.kind === "termNote"\)[\s\S]{0,700}?'
        r'\{renderText\(block\.text \?\? "", blockPage, section\.id, block\.id'
        r'(?:,\s*block\.id === keyboardLookupBlockId)?\)\}',
        app,
    )
    if not term_note_renderer:
        fail("term-note text does not use the same clickable renderer")

    print(json.dumps({
        "ok": True,
        "coveredBlocks": len(expected_blocks),
        "sentences": sentence_count,
        "meanings": meaning_count,
        "lowConfidenceSentences": low_confidence_count,
        "prospects": "潜在客户",
        "page9ClickableBlocks": 2,
        "page9CrossBlockMeaning": "应该",
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
