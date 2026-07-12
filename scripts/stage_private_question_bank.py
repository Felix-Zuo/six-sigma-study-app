from __future__ import annotations

import argparse
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
READER_ROOT = REPO_ROOT / "apps" / "reader"
DIST_ROOT = READER_ROOT / "dist"
DIST_STAGING_DIR = DIST_ROOT / "content" / "private"
LEGACY_PUBLIC_STAGING_DIR = READER_ROOT / "public" / "content" / "private"
DESTINATION = DIST_STAGING_DIR / "question-bank.private.json"
DICTIONARY_DESTINATION = DIST_STAGING_DIR / "question-dictionary.private.json"
STAGING_DIRECTORIES = (LEGACY_PUBLIC_STAGING_DIR, DIST_STAGING_DIR)
ALLOWED_STAGING_DIRECTORIES = frozenset(STAGING_DIRECTORIES)


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


def remove_staging_directory(path: Path) -> bool:
    if path not in ALLOWED_STAGING_DIRECTORIES:
        raise ValueError(f"Refusing to remove non-staging path: {path}")
    if path.is_symlink():
        path.unlink()
        return True
    if not path.exists():
        return False
    if not path.is_dir():
        raise RuntimeError(f"Expected staging directory, found non-directory: {path}")
    shutil.rmtree(path)
    return True


def clean_staging_directories() -> list[str]:
    removed: list[str] = []
    for path in STAGING_DIRECTORIES:
        if remove_staging_directory(path):
            removed.append(str(path))
    return removed


def clean() -> dict:
    removed = clean_staging_directories()
    return {
        "ok": True,
        "mode": "clean",
        "removed": removed,
        "source": str(SOURCE),
        "sourceExists": SOURCE.exists(),
    }


def stage() -> dict:
    removed = clean_staging_directories()
    if not SOURCE.exists():
        return {
            "ok": True,
            "mode": "stage",
            "staged": False,
            "reason": "private source not present",
            "removed": removed,
            "source": str(SOURCE),
        }

    if not DIST_ROOT.is_dir():
        raise FileNotFoundError(f"Reader build output is missing; run npm run build before staging: {DIST_ROOT}")

    payload = json.loads(SOURCE.read_text(encoding="utf-8"))
    questions = payload.get("questions")
    if not isinstance(questions, list) or not questions:
        raise ValueError(f"Private question bank has no questions: {SOURCE}")

    dictionary = build_private_dictionary(questions)
    try:
        DIST_STAGING_DIR.mkdir(parents=True, exist_ok=False)
        shutil.copyfile(SOURCE, DESTINATION)
        DICTIONARY_DESTINATION.write_text(
            json.dumps(dictionary, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    except Exception:
        remove_staging_directory(DIST_STAGING_DIR)
        raise

    return {
        "ok": True,
        "mode": "stage",
        "staged": True,
        "questions": len(questions),
        "dictionaryEntries": len(dictionary),
        "removed": removed,
        "source": str(SOURCE),
        "destination": str(DESTINATION),
        "dictionaryDestination": str(DICTIONARY_DESTINATION),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Stage or clean local private question-bank build assets.")
    parser.add_argument("mode", choices=("stage", "clean"), nargs="?", default="stage")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = clean() if args.mode == "clean" else stage()
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
