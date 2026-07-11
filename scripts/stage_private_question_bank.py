from __future__ import annotations

import json
import shutil
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = REPO_ROOT.parent
SOURCE = WORKSPACE_ROOT / "private-question-bank" / "ucourse-cssbb-1000.private.json"
DESTINATION = REPO_ROOT / "apps" / "reader" / "public" / "content" / "private" / "question-bank.private.json"


def main() -> None:
    if not SOURCE.exists():
        if DESTINATION.exists():
            DESTINATION.unlink()
        print(json.dumps({"ok": True, "staged": False, "reason": "private source not present"}, ensure_ascii=False))
        return

    payload = json.loads(SOURCE.read_text(encoding="utf-8"))
    questions = payload.get("questions")
    if not isinstance(questions, list) or not questions:
        raise ValueError(f"Private question bank has no questions: {SOURCE}")

    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SOURCE, DESTINATION)
    print(
        json.dumps(
            {
                "ok": True,
                "staged": True,
                "questions": len(questions),
                "source": str(SOURCE),
                "destination": str(DESTINATION),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
