from __future__ import annotations

import hashlib
import json
from pathlib import Path

from context_corrections import apply_context_corrections_to_manual, sha256_text, validate_bundle


REPO_ROOT = Path(__file__).resolve().parents[1]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    canonical_path = REPO_ROOT / "content" / "corrections" / "accepted-context-corrections.json"
    canonical = validate_bundle(json.loads(canonical_path.read_text(encoding="utf-8")))
    source = "It is impossible to revert to old ways."
    identity = hashlib.sha256(b"context-correction-fixture").hexdigest()
    response_hash = hashlib.sha256(b"validated-response").hexdigest()
    record = {
        "id": f"ctxcorr-{identity}",
        "status": "accepted",
        "source": {
            "sourceType": "manual",
            "chapterId": "ch02",
            "sectionId": "ch02-s01",
            "blockId": "ch02-s01-en-001",
            "page": 14,
            "sentenceIndex": 0,
            "sourceText": source,
            "sourceTextSha256": sha256_text(source),
        },
        "lexical": {
            "surface": "revert",
            "lemma": "revert",
            "partOfSpeech": "verb",
            "phrase": "revert to old ways",
            "phrasePattern": "revert to <previous-practice>",
        },
        "before": {"contextMeaningZh": "进行", "sentenceTranslationZh": None},
        "after": {
            "contextMeaningZh": "回到旧有做法；恢复到原来的状态",
            "sentenceTranslationZh": "不可能退回原来的做法。",
            "explanationZh": "revert to 表示回到先前状态或做法。",
            "alternativesZh": ["恢复原状"],
        },
        "matching": {
            "exactSignature": "revert|verb|revert to <previous-practice>",
            "autoApplyExact": True,
            "similarMode": "suggestion-only",
            "similarityThreshold": 0.88,
        },
        "review": {"acceptedBy": "user", "acceptedAt": "2026-07-12T00:00:00.000Z"},
        "provenance": {
            "provider": "deepseek",
            "model": "deepseek-v4-flash",
            "promptVersion": "context-correction-v1",
            "appVersion": "0.8.4-beta",
            "generatedAt": "2026-07-12T00:00:00.000Z",
            "responseSha256": response_hash,
        },
    }
    fixture = {
        "schemaVersion": "1.0.0",
        "format": "six-sigma-context-corrections",
        "bookId": "six-sigma-black-belt",
        "contentVersion": "0.2.0",
        "exportedAt": "2026-07-12T00:00:00.000Z",
        "corrections": [record],
    }
    validate_bundle(fixture)
    manual = {
        "bookId": "six-sigma-black-belt",
        "contextGlosses": {
            "ch02-s01-en-001": {
                "sentences": [{"source": source, "translation": "错误译文", "meanings": {"revert": "进行"}, "evidence": {"revert": "medium"}}]
            }
        },
    }
    applied = apply_context_corrections_to_manual(manual, fixture)
    sentence = manual["contextGlosses"]["ch02-s01-en-001"]["sentences"][0]
    require(applied == 1, "accepted correction was not applied")
    require(sentence["meanings"]["revert"].startswith("回到旧有做法"), "context meaning merge failed")
    require(sentence["evidence"]["revert"] == "high", "accepted correction evidence must be high")
    require(sentence["correctionIds"] == [record["id"]], "correction provenance was not retained")

    deepseek = (REPO_ROOT / "apps" / "reader" / "src" / "lib" / "deepSeekAssistant.ts").read_text(encoding="utf-8")
    store = (REPO_ROOT / "apps" / "reader" / "src" / "lib" / "contextCorrectionStore.ts").read_text(encoding="utf-8")
    app = (REPO_ROOT / "apps" / "reader" / "src" / "App.tsx").read_text(encoding="utf-8")
    java = (REPO_ROOT / "android" / "app" / "src" / "main" / "java" / "com" / "findjob" / "sixsigmastudy" / "NativeDeepSeekAssistantPlugin.java").read_text(encoding="utf-8")
    context = (REPO_ROOT / "apps" / "reader" / "src" / "lib" / "contextLookup.ts").read_text(encoding="utf-8")
    importer = (REPO_ROOT / "scripts" / "import_context_corrections.py").read_text(encoding="utf-8")
    require('deepseek-v4-flash' in deepseek and 'strict: true' in deepseek and 'additionalProperties: false' in deepseek, "strict DeepSeek schema missing")
    require('maxItems' not in deepseek and 'minItems' not in deepseek, "DeepSeek strict schema contains unsupported array constraints")
    require('submit_reading_assist' in deepseek and 'submit_question_assist' in deepseek, "bounded reading/question AI tools missing")
    require('detectedPhrase 必须逐字出现在' in deepseek and 'parseAiContextResult' in deepseek, "semantic response validation missing")
    require('lemma 可以是一个单词或小写英文短语' in deepseek and "{0,5}" in store, "multi-word lemma validation missing")
    require('acceptedCorrectionExport' in store and 'suggestion-only' in store and 'similarityThreshold' in store, "uniform correction store missing")
    require('AI 核验当前语境' in app and 'AI 简释' in app and 'AI 精讲' in app and '采用本次修订' in app and '导出 JSON' in app, "AI study UI incomplete")
    require('AES/GCM/NoPadding' in java and 'AndroidKeyStore' in java and 'PREF_CIPHERTEXT' in java, "Android Keystore encryption missing")
    require('revert to old ways' in context and '不是“进行”' in context, "reported revert regression is not fixed offline")
    require('"in depth"' in context and 'in a timely manner' in context and '运输途中' in context, "reported phrase/table context regressions are not fixed offline")
    require('skippedPrivateQuestionCorrections' in importer and 'apply_context_corrections_to_manual(manual, merged)' in importer, "import preflight/private boundary missing")
    require('sk-' not in java, "native source must not contain an API key")

    serialized = json.dumps(canonical, ensure_ascii=False).lower()
    require("apikey" not in serialized and "api_key" not in serialized, "canonical correction bundle contains a key-like field")
    require(all(record["source"]["sourceType"] == "manual" for record in canonical["corrections"]), "public canonical corrections contain private question text")
    print(json.dumps({"ok": True, "canonicalCorrections": len(canonical["corrections"]), "fixtureApplied": applied}, ensure_ascii=False))


if __name__ == "__main__":
    main()
