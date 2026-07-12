from __future__ import annotations

import json
from collections import defaultdict
import shutil
from pathlib import Path

from build_manual_dictionary import (
    DEFAULT_ECDICT_CSV,
    WORD_RE,
    ecdict_entry,
    lemma_candidates,
    load_ecdict_rows,
    normalize_lookup_key,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = REPO_ROOT.parent
SOURCE = WORKSPACE_ROOT / "private-question-bank" / "ucourse-cssbb-1000.private.json"
DESTINATION = REPO_ROOT / "apps" / "reader" / "public" / "content" / "private" / "question-bank.private.json"
DICTIONARY_DESTINATION = REPO_ROOT / "apps" / "reader" / "public" / "content" / "private" / "question-dictionary.private.json"


def collect_question_forms(questions: list[dict]) -> set[str]:
    forms: set[str] = set()
    for question in questions:
        texts = [question.get("stem", {}).get("en", ""), question.get("explanation", {}).get("en", "")]
        texts.extend(option.get("en", "") for option in question.get("options", []))
        for text in texts:
            for token in WORD_RE.findall(str(text)):
                normalized = normalize_lookup_key(token)
                if normalized:
                    forms.add(normalized)
    return forms


def build_private_dictionary(questions: list[dict]) -> list[dict]:
    rows = load_ecdict_rows(DEFAULT_ECDICT_CSV)
    selected_forms: dict[str, set[str]] = defaultdict(set)
    for form in sorted(collect_question_forms(questions)):
        for candidate in lemma_candidates(form):
            if candidate in rows:
                selected_forms[candidate].add(form)
                break

    entries: list[dict] = []
    used_keys: set[str] = set()
    for lemma in sorted(selected_forms):
        entry = ecdict_entry(rows[lemma], selected_forms[lemma], used_keys)
        if not entry:
            continue
        entries.append(entry)
        used_keys.update(normalize_lookup_key(key) for key in [entry["term"], *entry["lookupKeys"]])
    return entries


def main() -> None:
    if not SOURCE.exists():
        for path in [DESTINATION, DICTIONARY_DESTINATION]:
            if path.exists():
                path.unlink()
        print(json.dumps({"ok": True, "staged": False, "reason": "private source not present"}, ensure_ascii=False))
        return

    payload = json.loads(SOURCE.read_text(encoding="utf-8"))
    questions = payload.get("questions")
    if not isinstance(questions, list) or not questions:
        raise ValueError(f"Private question bank has no questions: {SOURCE}")

    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SOURCE, DESTINATION)
    dictionary = build_private_dictionary(questions)
    DICTIONARY_DESTINATION.write_text(json.dumps(dictionary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "ok": True,
                "staged": True,
                "questions": len(questions),
                "dictionaryEntries": len(dictionary),
                "source": str(SOURCE),
                "destination": str(DESTINATION),
                "dictionaryDestination": str(DICTIONARY_DESTINATION),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
