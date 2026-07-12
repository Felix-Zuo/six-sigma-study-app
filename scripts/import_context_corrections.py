from __future__ import annotations

import argparse
import json
from pathlib import Path

from context_corrections import apply_context_corrections_to_manual, load_canonical_bundle, utc_now, validate_bundle


REPO_ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate and merge an App-exported context correction bundle.")
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    incoming = validate_bundle(json.loads(args.bundle.read_text(encoding="utf-8")))
    canonical = load_canonical_bundle(args.repo_root)
    if incoming["bookId"] != canonical["bookId"]:
        raise ValueError("incoming correction bundle targets a different book")
    accepted = [
        record for record in incoming["corrections"]
        if record["status"] == "accepted" and record["source"]["sourceType"] == "manual"
    ]
    skipped_questions = sum(
        record["status"] == "accepted" and record["source"]["sourceType"] == "question"
        for record in incoming["corrections"]
    )
    by_id = {record["id"]: record for record in canonical["corrections"]}
    for record in accepted:
        by_id[record["id"]] = record
    merged = {
        **canonical,
        "contentVersion": incoming["contentVersion"],
        "exportedAt": utc_now(),
        "corrections": sorted(by_id.values(), key=lambda item: item["review"]["acceptedAt"] or ""),
    }
    validate_bundle(merged)
    manual_path = args.repo_root / "content" / "processed" / "manual.json"
    manual = json.loads(manual_path.read_text(encoding="utf-8"))
    apply_context_corrections_to_manual(manual, merged)
    if not args.dry_run:
        output = args.repo_root / "content" / "corrections" / "accepted-context-corrections.json"
        output.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "acceptedIncoming": len(accepted),
        "skippedPrivateQuestionCorrections": skipped_questions,
        "total": len(merged["corrections"]),
        "dryRun": args.dry_run,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
