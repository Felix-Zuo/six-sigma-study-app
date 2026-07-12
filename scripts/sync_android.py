from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
STAGING_SCRIPT = REPO_ROOT / "scripts" / "stage_private_question_bank.py"


def command(name: str) -> str:
    return f"{name}.cmd" if os.name == "nt" else name


def run(args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=REPO_ROOT, check=check, text=True)


def main() -> int:
    run([command("npm"), "run", "build"])
    try:
        run([sys.executable, str(STAGING_SCRIPT), "stage"])
        run([command("npx"), "cap", "sync", "android"])
    finally:
        # The private bank belongs only in the copied Android assets, never in a
        # reusable web artifact left on disk after synchronization.
        run([sys.executable, str(STAGING_SCRIPT), "clean"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
