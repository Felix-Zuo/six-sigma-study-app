from __future__ import annotations

import json
import subprocess
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = REPO_ROOT.parent
PRIVATE_DIR = WORKSPACE_ROOT / "private-question-bank"


def run_git(args: list[str]) -> str:
    completed = subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )
    return completed.stdout


def main() -> None:
    tracked = run_git(["ls-files"]).splitlines()
    leaked = [
        path for path in tracked
        if "private-question-bank" in path or path.endswith(".private.json")
    ]
    if leaked:
        raise AssertionError(f"private question bank files are tracked: {leaked}")

    repo_gitignore = (REPO_ROOT / ".gitignore").read_text(encoding="utf-8")
    workspace_gitignore_path = WORKSPACE_ROOT / ".gitignore"
    workspace_gitignore = workspace_gitignore_path.read_text(encoding="utf-8") if workspace_gitignore_path.exists() else ""
    if "private-question-bank/" not in repo_gitignore or "*.private.json" not in repo_gitignore:
        raise AssertionError("repo .gitignore does not protect private question bank files")
    if workspace_gitignore_path.exists() and "private-question-bank/" not in workspace_gitignore:
        raise AssertionError("workspace .gitignore does not protect private-question-bank")

    private_json = PRIVATE_DIR / "ucourse-cssbb-1000.private.json"
    report = PRIVATE_DIR / "IMPORT_REPORT.md"
    result = {
        "ok": True,
        "privateDir": str(PRIVATE_DIR),
        "privateJsonExists": private_json.exists(),
        "reportExists": report.exists(),
        "trackedLeakCount": 0,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
