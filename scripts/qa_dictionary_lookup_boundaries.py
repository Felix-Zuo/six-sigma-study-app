from __future__ import annotations

import csv
import json
import tempfile
from pathlib import Path
from typing import Any

from build_manual_dictionary import (
    DEFAULT_ECDICT_CSV,
    build_dictionary,
    is_affix_notation,
    load_ecdict_rows_with_audit,
    normalize_lookup_key,
)


REPO_ROOT = Path(__file__).resolve().parents[1]
PROCESSED_DICTIONARY = REPO_ROOT / "content" / "processed" / "dictionary" / "six-sigma-terms.json"
GENERATED_DICTIONARY = REPO_ROOT / "apps" / "reader" / "src" / "generated" / "six-sigma-terms.json"
MANUAL_PATH = REPO_ROOT / "content" / "processed" / "manual.json"
CSV_FIELDS = ["word", "phonetic", "definition", "translation", "pos", "exchange"]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def app_term_index(entries: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    index: dict[str, dict[str, Any]] = {}
    for entry in entries:
        key = normalize_lookup_key(entry["term"])
        if key:
            index.setdefault(key, entry)
    for entry in entries:
        for lookup_key in entry.get("lookupKeys", []):
            key = normalize_lookup_key(lookup_key)
            if key:
                index.setdefault(key, entry)
    return index


def verify_bounded_loader_regression() -> dict[str, int]:
    fixture_rows = [
        {"word": "-scope", "translation": "suffix meaning an observing instrument"},
        {"word": "scope.", "translation": "abbreviation placeholder"},
        {"word": "scope", "translation": "n. range or extent"},
        {"word": "pre-", "translation": "prefix meaning before"},
        {"word": "pre", "translation": "n. an ordinary base word"},
        {"word": "-affix-only", "translation": "suffix without an ordinary base"},
    ]
    with tempfile.TemporaryDirectory() as temp_dir:
        fixture_path = Path(temp_dir) / "ecdict-affix-fixture.csv"
        with fixture_path.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
            writer.writeheader()
            writer.writerows(fixture_rows)
        rows, audit = load_ecdict_rows_with_audit(fixture_path)

    require(rows["scope"]["word"] == "scope", "plain exact scope row did not replace a punctuated duplicate")
    require(rows["pre"]["word"] == "pre", "ordinary base did not win over prefix notation")
    require("affix only" not in rows, "affix-only row leaked into ordinary lookup rows")
    require(audit["ecdictAffixRowsExcluded"] == 3, "fixture did not exclude every affix row")
    require(audit["ecdictAffixOrdinaryConflicts"] == 2, "fixture conflict count changed unexpectedly")
    require(audit["ecdictAffixOnlyKeys"] == 1, "fixture affix-only count changed unexpectedly")
    require(audit["ecdictExactOrdinaryReplacements"] == 1, "fixture exact-row replacement was not recorded")
    return audit


def main() -> None:
    fixture_audit = verify_bounded_loader_regression()
    processed = json.loads(PROCESSED_DICTIONARY.read_text(encoding="utf-8"))
    generated = json.loads(GENERATED_DICTIONARY.read_text(encoding="utf-8"))
    require(processed == generated, "processed and generated dictionary outputs differ")

    source_audit: dict[str, int] | None = None
    build_stats: dict[str, Any] | None = None
    if DEFAULT_ECDICT_CSV.exists():
        manual = json.loads(MANUAL_PATH.read_text(encoding="utf-8"))
        rebuilt, build_stats = build_dictionary(manual, DEFAULT_ECDICT_CSV)
        require(processed == rebuilt, "dictionary outputs are stale; rerun scripts/build_manual_dictionary.py")

        source_rows, source_audit = load_ecdict_rows_with_audit(DEFAULT_ECDICT_CSV)
        require(source_rows.get("scope", {}).get("word") == "scope", "ECDICT loader did not select ordinary scope")
        require(source_audit["ecdictAffixOrdinaryConflicts"] > 0, "source audit did not detect affix/base conflicts")
        require(
            all(not is_affix_notation(row.get("word", "")) for row in source_rows.values()),
            "affix notation leaked into the ordinary ECDICT row map",
        )

    emitted_affixes = [entry["term"] for entry in processed if is_affix_notation(entry.get("term", ""))]
    require(not emitted_affixes, f"generated dictionary still contains affix entries: {emitted_affixes[:10]}")

    index = app_term_index(processed)
    scope = index.get("scope")
    require(scope is not None, "scope is missing from the generated lookup index")
    require(scope["term"].casefold() == "scope", f"scope resolved to {scope['term']!r} instead of ordinary scope")
    require("范围" in scope["translation"], "scope does not contain the ordinary range meaning")
    require("后缀" not in scope["translation"], "scope still contains the medical suffix meaning")

    result = {
        "ok": True,
        "dictionaryEntries": len(processed),
        "fixtureAudit": fixture_audit,
        "sourceEcdictAvailable": DEFAULT_ECDICT_CSV.exists(),
        "sourceAudit": source_audit,
        "buildConflictCount": build_stats["ecdictAffixOrdinaryConflicts"] if build_stats else None,
        "emittedAffixEntries": len(emitted_affixes),
        "scope": {
            "term": scope["term"],
            "translation": scope["translation"],
            "source": scope.get("source"),
        },
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
