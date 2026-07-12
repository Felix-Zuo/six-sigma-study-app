from __future__ import annotations

import argparse
import json
import math
import re
import shutil
from collections import Counter
from pathlib import Path
from typing import Any

import jieba
import numpy as np
from sentence_transformers import SentenceTransformer
from simalign import SentenceAligner


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANUAL = REPO_ROOT / "content" / "processed" / "manual.json"
DEFAULT_PUBLIC_MANUAL = REPO_ROOT / "apps" / "reader" / "public" / "content" / "manual.json"
TEXT_KINDS = {"paragraph", "listItem", "table", "heading"}
EN_WORD_RE = re.compile(r"[A-Za-z](?:[A-Za-z0-9'’-]*[A-Za-z0-9])?")
EN_SENTENCE_RE = re.compile(r"(?<=[.!?;])\s+(?=[A-Za-z0-9(\[])")
ZH_SENTENCE_RE = re.compile(r"(?<=[。！？；])")


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def block_text(block: dict[str, Any]) -> str:
    text = clean_text(str(block.get("text") or ""))
    if text:
        return text
    rows = block.get("rows") or []
    return clean_text(" ".join(
        " ".join(str(cell) for cell in row) if isinstance(row, list) else str(row)
        for row in rows
    ))


def split_en_sentences(text: str) -> list[str]:
    sentences = [clean_text(item) for item in EN_SENTENCE_RE.split(clean_text(text)) if clean_text(item)]
    return sentences or [clean_text(text)]


def split_zh_sentences(text: str) -> list[str]:
    sentences = [clean_text(item) for item in ZH_SENTENCE_RE.split(clean_text(text)) if clean_text(item)]
    return sentences or [clean_text(text)]


def normalized_position(index: int, count: int) -> float:
    return index / max(1, count - 1)


def monotonic_assignment(scores: np.ndarray) -> list[int]:
    """Map every source row to a non-decreasing target column."""
    rows, columns = scores.shape
    if rows == 0 or columns == 0:
        return []
    dp = np.full((rows, columns), -math.inf, dtype=np.float32)
    previous = np.full((rows, columns), -1, dtype=np.int32)
    dp[0] = scores[0]
    for row in range(1, rows):
        best_value = -math.inf
        best_column = 0
        for column in range(columns):
            if dp[row - 1, column] > best_value:
                best_value = float(dp[row - 1, column])
                best_column = column
            dp[row, column] = best_value + scores[row, column]
            previous[row, column] = best_column
    current = int(np.argmax(dp[-1]))
    result = [current]
    for row in range(rows - 1, 0, -1):
        current = int(previous[row, current])
        result.append(current)
    return list(reversed(result))


def align_blocks(
    en_blocks: list[dict[str, Any]],
    zh_blocks: list[dict[str, Any]],
    sentence_model: SentenceTransformer,
) -> list[tuple[dict[str, Any], dict[str, Any], float]]:
    en_texts = [block_text(block) for block in en_blocks]
    zh_texts = [block_text(block) for block in zh_blocks]
    embeddings = sentence_model.encode(en_texts + zh_texts, normalize_embeddings=True, show_progress_bar=False)
    en_vectors = embeddings[: len(en_texts)]
    zh_vectors = embeddings[len(en_texts) :]
    semantic = en_vectors @ zh_vectors.T
    scores = semantic.copy()
    for en_index, en_block in enumerate(en_blocks):
        for zh_index, zh_block in enumerate(zh_blocks):
            position_gap = abs(
                normalized_position(en_index, len(en_blocks))
                - normalized_position(zh_index, len(zh_blocks))
            )
            scores[en_index, zh_index] -= 0.16 * position_gap
            if en_block.get("kind") == zh_block.get("kind"):
                scores[en_index, zh_index] += 0.035
            if en_block.get("page") and en_block.get("page") == zh_block.get("page"):
                scores[en_index, zh_index] += 0.025
    assignment = monotonic_assignment(scores)
    return [
        (en_blocks[index], zh_blocks[target], float(semantic[index, target]))
        for index, target in enumerate(assignment)
    ]


def best_sentence_matches(
    source_text: str,
    target_text: str,
    sentence_model: SentenceTransformer,
) -> list[tuple[str, str, float]]:
    source_sentences = split_en_sentences(source_text)
    target_sentences = split_zh_sentences(target_text)
    embeddings = sentence_model.encode(
        source_sentences + target_sentences,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    source_vectors = embeddings[: len(source_sentences)]
    target_vectors = embeddings[len(source_sentences) :]
    semantic = source_vectors @ target_vectors.T
    scores = semantic.copy()
    for source_index in range(len(source_sentences)):
        for target_index in range(len(target_sentences)):
            position_gap = abs(
                normalized_position(source_index, len(source_sentences))
                - normalized_position(target_index, len(target_sentences))
            )
            scores[source_index, target_index] -= 0.08 * position_gap
    assignment = monotonic_assignment(scores)
    return [
        (source_sentences[index], target_sentences[target], float(semantic[index, target]))
        for index, target in enumerate(assignment)
    ]


def chinese_tokens(text: str) -> list[str]:
    return [token for token in jieba.lcut(text, cut_all=False) if token and not token.isspace()]


def join_chinese_tokens(tokens: list[str]) -> str:
    output = ""
    for token in tokens:
        if not output:
            output = token
        elif re.fullmatch(r"[A-Za-z0-9.%+-]+", token) and re.search(r"[A-Za-z0-9]$", output):
            output += f" {token}"
        else:
            output += token
    return output.strip(" ，。；：、!?！？()（）[]【】\"'")


def aligned_meanings(
    source: str,
    target: str,
    word_aligner: SentenceAligner,
) -> tuple[dict[str, str], dict[str, str]]:
    source_tokens = EN_WORD_RE.findall(source)
    target_tokens = chinese_tokens(target)
    if not source_tokens or not target_tokens:
        return {}, {}
    try:
        alignments = word_aligner.get_word_aligns(source_tokens, target_tokens)
    except (ValueError, RuntimeError) as error:
        print(
            f"word alignment skipped: {type(error).__name__}: {source[:100]!r}",
            flush=True,
        )
        return {}, {}
    votes: dict[int, Counter[int]] = {index: Counter() for index in range(len(source_tokens))}
    for method, pairs in alignments.items():
        weight = 2 if method == "inter" else 1
        for source_index, target_index in pairs:
            votes[source_index][target_index] += weight

    meanings: dict[str, str] = {}
    evidence: dict[str, str] = {}
    for source_index, source_token in enumerate(source_tokens):
        candidate_votes = votes[source_index]
        if not candidate_votes:
            continue
        accepted = sorted(index for index, count in candidate_votes.items() if count >= 2)
        confidence = "high"
        if not accepted:
            strongest_vote = max(candidate_votes.values())
            top_candidates = sorted(index for index, count in candidate_votes.items() if count == strongest_vote)
            anchor = top_candidates[0]
            accepted = [index for index in top_candidates if abs(index - anchor) <= 1]
            confidence = "medium"
        # Keep a compact contiguous phrase around the strongest aligned token.
        strongest = max(accepted, key=lambda index: candidate_votes[index])
        compact = sorted(index for index in accepted if abs(index - strongest) <= 2)
        meaning = join_chinese_tokens([target_tokens[index] for index in compact])
        if not meaning or not re.search(r"[\u3400-\u9fffA-Za-z0-9]", meaning):
            continue
        key = source_token.lower().replace("’", "'").strip(".-")
        if key and key not in meanings:
            meanings[key] = meaning
            evidence[key] = confidence
    return meanings, evidence


def build_glosses(
    manual: dict[str, Any],
    chapters: set[int] | None,
    sentence_model: SentenceTransformer,
    word_aligner: SentenceAligner,
) -> tuple[dict[str, Any], dict[str, Any]]:
    glosses: dict[str, Any] = {}
    report: dict[str, Any] = {
        "chapters": [],
        "blocks": 0,
        "sentences": 0,
        "meanings": 0,
        "lowConfidenceSentences": 0,
    }
    for chapter in manual.get("chapters", []):
        chapter_number = int(chapter.get("chapter", 0))
        if chapters is not None and chapter_number not in chapters:
            continue
        chapter_blocks = chapter_sentences = chapter_meanings = 0
        for section in chapter.get("sections", []):
            en_blocks = [
                block for block in section.get("content", {}).get("en", [])
                if block.get("kind") in TEXT_KINDS and block_text(block)
            ]
            zh_blocks = [
                block for block in section.get("content", {}).get("zh", [])
                if block.get("kind") in TEXT_KINDS and block_text(block)
            ]
            if not en_blocks or not zh_blocks:
                continue
            for en_block, zh_block, block_similarity in align_blocks(en_blocks, zh_blocks, sentence_model):
                source = block_text(en_block)
                translation = block_text(zh_block)
                sentences: list[dict[str, Any]] = []
                for source_sentence, target_sentence, sentence_similarity in best_sentence_matches(
                    source, translation, sentence_model
                ):
                    meanings, evidence = aligned_meanings(source_sentence, target_sentence, word_aligner)
                    sentence_confidence = (
                        "high" if sentence_similarity >= 0.60
                        else "medium" if sentence_similarity >= 0.45
                        else "low"
                    )
                    if sentence_confidence == "low":
                        report["lowConfidenceSentences"] += 1
                        meanings = {}
                        evidence = {}
                    sentences.append({
                        "source": source_sentence,
                        "translation": target_sentence,
                        "confidence": sentence_confidence,
                        "similarity": round(sentence_similarity, 4),
                        "meanings": meanings,
                        "evidence": evidence,
                    })
                    chapter_sentences += 1
                    chapter_meanings += len(meanings)
                glosses[en_block["id"]] = {
                    "targetBlockId": zh_block["id"],
                    "translation": translation,
                    "similarity": round(block_similarity, 4),
                    "sentences": sentences,
                }
                chapter_blocks += 1
        report["chapters"].append({
            "chapter": chapter_number,
            "blocks": chapter_blocks,
            "sentences": chapter_sentences,
            "meanings": chapter_meanings,
        })
        report["blocks"] += chapter_blocks
        report["sentences"] += chapter_sentences
        report["meanings"] += chapter_meanings
        print(
            f"chapter {chapter_number:02d}: {chapter_blocks} blocks, "
            f"{chapter_sentences} sentences, {chapter_meanings} meanings",
            flush=True,
        )
    return glosses, report


def repair_cross_block_sentences(
    manual: dict[str, Any],
    glosses: dict[str, Any],
    word_aligner: SentenceAligner,
) -> int:
    repaired = 0
    for chapter in manual.get("chapters", []):
        for section in chapter.get("sections", []):
            blocks = [
                block for block in section.get("content", {}).get("en", [])
                if block.get("kind") in {"paragraph", "listItem"} and block_text(block)
            ]
            for left, right in zip(blocks, blocks[1:]):
                left_text = block_text(left)
                right_text = block_text(right)
                if re.search(r"[.!?][\"')\]]?$", left_text) or not re.match(r"^[a-z]", right_text):
                    continue
                left_gloss = glosses.get(left.get("id"))
                right_gloss = glosses.get(right.get("id"))
                if not left_gloss or not right_gloss:
                    continue
                if left_gloss.get("targetBlockId") != right_gloss.get("targetBlockId"):
                    continue
                left_sentences = left_gloss.get("sentences") or []
                right_sentences = right_gloss.get("sentences") or []
                if not left_sentences or not right_sentences:
                    continue
                left_sentence = left_sentences[-1]
                right_sentence = right_sentences[0]
                if left_sentence.get("translation") != right_sentence.get("translation"):
                    continue
                left_source = clean_text(str(left_sentence.get("source") or ""))
                right_source = clean_text(str(right_sentence.get("source") or ""))
                joined_source = left_source if left_source == right_source else clean_text(f"{left_source} {right_source}")
                translation = clean_text(str(left_sentence.get("translation") or ""))
                meanings, evidence = aligned_meanings(joined_source, translation, word_aligner)
                repaired_similarity = max(
                    float(left_sentence.get("similarity") or 0),
                    float(right_sentence.get("similarity") or 0),
                )
                for sentence in (left_sentence, right_sentence):
                    sentence["source"] = joined_source
                    sentence["meanings"] = meanings
                    sentence["evidence"] = evidence
                    sentence["confidence"] = "high" if repaired_similarity >= 0.60 else "medium"
                    sentence["similarity"] = round(repaired_similarity, 4)
                repaired += 1
    return repaired


def parse_chapters(value: str | None) -> set[int] | None:
    if not value:
        return None
    result: set[int] = set()
    for part in value.split(","):
        if "-" in part:
            start, end = (int(item) for item in part.split("-", 1))
            result.update(range(start, end + 1))
        else:
            result.add(int(part))
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Build occurrence-level EN/ZH context glosses for the manual.")
    parser.add_argument("--manual", type=Path, default=DEFAULT_MANUAL)
    parser.add_argument("--public-manual", type=Path, default=DEFAULT_PUBLIC_MANUAL)
    parser.add_argument("--chapters", help="Comma-separated chapters or ranges, for example 1,7,26-27")
    parser.add_argument("--report", type=Path, default=REPO_ROOT / ".qa" / "context-gloss-report.json")
    parser.add_argument("--sentence-model", default="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
    parser.add_argument("--word-model", default="bert")
    parser.add_argument("--repair-only", action="store_true", help="Repair cross-block sentences in existing glosses.")
    args = parser.parse_args()

    manual = json.loads(args.manual.read_text(encoding="utf-8"))
    selected_chapters = parse_chapters(args.chapters)
    word_aligner = SentenceAligner(model=args.word_model, token_type="word", matching_methods="mai")
    if args.repair_only:
        new_glosses = manual.get("contextGlosses") or {}
        if not new_glosses:
            raise RuntimeError("--repair-only requires existing contextGlosses")
        report = {"repairOnly": True}
    else:
        sentence_model = SentenceTransformer(args.sentence_model)
        new_glosses, report = build_glosses(manual, selected_chapters, sentence_model, word_aligner)

    existing = manual.get("contextGlosses") if selected_chapters else None
    if selected_chapters and isinstance(existing, dict):
        selected_prefixes = {f"ch{chapter:02d}" for chapter in selected_chapters}
        retained = {
            key: value for key, value in existing.items()
            if not any(key.startswith(prefix) for prefix in selected_prefixes)
        }
        retained.update(new_glosses)
        new_glosses = retained
    repaired_cross_block = repair_cross_block_sentences(manual, new_glosses, word_aligner)
    report["repairedCrossBlockSentences"] = repaired_cross_block
    manual["contextGlossesVersion"] = "1.1.0"
    manual["contextGlosses"] = new_glosses
    args.manual.write_text(json.dumps(manual, ensure_ascii=False, indent=2), encoding="utf-8")
    args.public_manual.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(args.manual, args.public_manual)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
