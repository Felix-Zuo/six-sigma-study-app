from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "1.0.0"
FORMAT = "six-sigma-context-corrections"
RECORD_KEYS = {"id", "status", "source", "lexical", "before", "after", "matching", "review", "provenance"}
SOURCE_KEYS = {"sourceType", "chapterId", "sectionId", "blockId", "page", "sentenceIndex", "sourceText", "sourceTextSha256"}
LEXICAL_KEYS = {"surface", "lemma", "partOfSpeech", "phrase", "phrasePattern"}
BEFORE_KEYS = {"contextMeaningZh", "sentenceTranslationZh"}
AFTER_KEYS = {"contextMeaningZh", "sentenceTranslationZh", "explanationZh", "alternativesZh"}
MATCHING_KEYS = {"exactSignature", "autoApplyExact", "similarMode", "similarityThreshold"}
REVIEW_KEYS = {"acceptedBy", "acceptedAt"}
PROVENANCE_KEYS = {"provider", "model", "promptVersion", "appVersion", "generatedAt", "responseSha256"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def require_exact_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    actual = set(value)
    if actual != expected:
        raise ValueError(f"{label} fields mismatch: missing={sorted(expected - actual)}, extra={sorted(actual - expected)}")


def require_nonempty_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string")
    return value


def validate_record(record: Any) -> dict[str, Any]:
    if not isinstance(record, dict):
        raise ValueError("correction must be an object")
    require_exact_keys(record, RECORD_KEYS, "correction")
    if not re.fullmatch(r"ctxcorr-[a-f0-9]{64}", str(record["id"])):
        raise ValueError(f"invalid correction id: {record['id']}")
    if record["status"] not in {"proposed", "accepted", "rejected", "revoked", "superseded"}:
        raise ValueError(f"invalid correction status: {record['status']}")

    source = record["source"]
    lexical = record["lexical"]
    before = record["before"]
    after = record["after"]
    matching = record["matching"]
    review = record["review"]
    provenance = record["provenance"]
    for value, keys, label in (
        (source, SOURCE_KEYS, "source"),
        (lexical, LEXICAL_KEYS, "lexical"),
        (before, BEFORE_KEYS, "before"),
        (after, AFTER_KEYS, "after"),
        (matching, MATCHING_KEYS, "matching"),
        (review, REVIEW_KEYS, "review"),
        (provenance, PROVENANCE_KEYS, "provenance"),
    ):
        if not isinstance(value, dict):
            raise ValueError(f"{label} must be an object")
        require_exact_keys(value, keys, label)

    if source["sourceType"] not in {"manual", "question"}:
        raise ValueError("source.sourceType must be manual or question")
    require_nonempty_string(source["sectionId"], "source.sectionId")
    source_text = require_nonempty_string(source["sourceText"], "source.sourceText")
    if not isinstance(source["page"], int) or source["page"] < 1:
        raise ValueError("source.page must be a positive integer")
    if source["sentenceIndex"] is not None and (not isinstance(source["sentenceIndex"], int) or source["sentenceIndex"] < 0):
        raise ValueError("source.sentenceIndex must be null or a non-negative integer")
    if source["sourceTextSha256"] != sha256_text(source_text):
        raise ValueError(f"source hash mismatch for {record['id']}")

    for key in LEXICAL_KEYS:
        require_nonempty_string(lexical[key], f"lexical.{key}")
    if lexical["phrase"].lower() not in source_text.lower():
        raise ValueError(f"lexical phrase is not present in source text: {record['id']}")
    for key in ("contextMeaningZh", "sentenceTranslationZh", "explanationZh"):
        require_nonempty_string(after[key], f"after.{key}")
    if not isinstance(after["alternativesZh"], list) or len(after["alternativesZh"]) > 5:
        raise ValueError("after.alternativesZh must be an array with at most five items")
    for index, value in enumerate(after["alternativesZh"]):
        require_nonempty_string(value, f"after.alternativesZh[{index}]")

    if matching["autoApplyExact"] is not True or matching["similarMode"] != "suggestion-only":
        raise ValueError("matching policy must keep exact-only automatic application")
    if not isinstance(matching["similarityThreshold"], (int, float)) or not 0 <= matching["similarityThreshold"] <= 1:
        raise ValueError("matching.similarityThreshold must be between 0 and 1")
    if record["status"] == "accepted" and (review["acceptedBy"] != "user" or not review["acceptedAt"]):
        raise ValueError("accepted corrections require user review metadata")
    if provenance["provider"] not in {"deepseek", "human"}:
        raise ValueError("unsupported correction provider")
    for key in ("model", "promptVersion", "appVersion", "generatedAt", "responseSha256"):
        require_nonempty_string(provenance[key], f"provenance.{key}")
    if not re.fullmatch(r"[a-f0-9]{64}", provenance["responseSha256"]):
        raise ValueError("provenance.responseSha256 must be SHA-256")
    return record


def validate_bundle(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("correction bundle must be an object")
    require_exact_keys(payload, {"schemaVersion", "format", "bookId", "contentVersion", "exportedAt", "corrections"}, "bundle")
    if payload["schemaVersion"] != SCHEMA_VERSION or payload["format"] != FORMAT:
        raise ValueError("unsupported correction bundle format")
    require_nonempty_string(payload["bookId"], "bookId")
    require_nonempty_string(payload["contentVersion"], "contentVersion")
    require_nonempty_string(payload["exportedAt"], "exportedAt")
    if not isinstance(payload["corrections"], list):
        raise ValueError("corrections must be an array")
    seen: set[str] = set()
    for record in payload["corrections"]:
        validate_record(record)
        if record["id"] in seen:
            raise ValueError(f"duplicate correction id: {record['id']}")
        seen.add(record["id"])
    return payload


def find_sentence(gloss: dict[str, Any], record: dict[str, Any]) -> dict[str, Any]:
    sentences = gloss.get("sentences") or []
    sentence_index = record["source"]["sentenceIndex"]
    source_text = record["source"]["sourceText"]
    if isinstance(sentence_index, int) and sentence_index < len(sentences):
        candidate = sentences[sentence_index]
        if candidate.get("source") == source_text:
            return candidate
    for sentence in sentences:
        if sentence.get("source") == source_text:
            return sentence
    raise ValueError(f"source sentence not found for correction {record['id']}")


def apply_context_corrections_to_manual(manual: dict[str, Any], bundle: dict[str, Any]) -> int:
    validate_bundle(bundle)
    if manual.get("bookId", "six-sigma-black-belt") != bundle["bookId"]:
        raise ValueError("correction bundle bookId does not match manual")
    glosses = manual.get("contextGlosses")
    if not isinstance(glosses, dict):
        if any(record["status"] == "accepted" and record["source"]["sourceType"] == "manual" for record in bundle["corrections"]):
            raise ValueError("manual has no contextGlosses to receive corrections")
        return 0
    applied = 0
    for record in bundle["corrections"]:
        if record["status"] != "accepted" or record["source"]["sourceType"] != "manual":
            continue
        block_id = record["source"]["blockId"]
        gloss = glosses.get(block_id)
        if not isinstance(gloss, dict):
            raise ValueError(f"context gloss block not found: {block_id}")
        sentence = find_sentence(gloss, record)
        surface = re.sub(r"^[^a-z]+|[^a-z]+$", "", record["lexical"]["surface"].lower())
        lemma = re.sub(r"^[^a-z]+|[^a-z]+$", "", record["lexical"]["lemma"].lower())
        meanings = sentence.setdefault("meanings", {})
        evidence = sentence.setdefault("evidence", {})
        meanings[surface] = record["after"]["contextMeaningZh"]
        evidence[surface] = "high"
        if lemma and lemma != surface:
            meanings[lemma] = record["after"]["contextMeaningZh"]
            evidence[lemma] = "high"
        sentence["translation"] = record["after"]["sentenceTranslationZh"]
        correction_ids = sentence.setdefault("correctionIds", [])
        if record["id"] not in correction_ids:
            correction_ids.append(record["id"])
        applied += 1
    manual["contextCorrectionsVersion"] = SCHEMA_VERSION
    manual["acceptedContextCorrectionCount"] = applied
    return applied


def load_canonical_bundle(repo_root: Path) -> dict[str, Any]:
    path = repo_root / "content" / "corrections" / "accepted-context-corrections.json"
    return validate_bundle(json.loads(path.read_text(encoding="utf-8")))
