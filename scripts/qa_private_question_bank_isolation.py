from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from pathlib import PurePosixPath

from qa_public_artifact import DIST_ROOT, scan_artifact


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = REPO_ROOT.parent
PRIVATE_DIR = WORKSPACE_ROOT / "private-question-bank"
LEGACY_PUBLIC_STAGING_DIR = REPO_ROOT / "apps" / "reader" / "public" / "content" / "private"


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


def has_content_private_path(parts: tuple[str, ...]) -> bool:
    return any(parts[index:index + 2] == ("content", "private") for index in range(len(parts) - 1))


def is_private_git_path(path: str) -> bool:
    parts = tuple(part.casefold() for part in PurePosixPath(path.replace("\\", "/")).parts)
    return (
        "private-question-bank" in parts
        or has_content_private_path(parts)
        or (bool(parts) and parts[-1].endswith(".private.json"))
    )


def main() -> None:
    tracked = [path for path in run_git(["ls-files", "-z"]).split("\0") if path]
    leaked = sorted(path for path in tracked if is_private_git_path(path))
    legacy_public_staging_exists = LEGACY_PUBLIC_STAGING_DIR.exists() or LEGACY_PUBLIC_STAGING_DIR.is_symlink()
    dist_scan = scan_artifact(DIST_ROOT)

    private_json = PRIVATE_DIR / "ucourse-cssbb-1000.private.json"
    report = PRIVATE_DIR / "IMPORT_REPORT.md"
    checks = {
        "gitTrackedPrivateFilesAbsent": not leaked,
        "legacyPublicStagingAbsent": not legacy_public_staging_exists,
        "ordinaryDistExists": dist_scan["artifactExists"] and dist_scan["artifactIsDirectory"],
        "ordinaryDistPrivateContentAbsent": dist_scan["ok"],
    }
    result = {
        "ok": all(checks.values()),
        "checks": checks,
        "privateDir": str(PRIVATE_DIR),
        "privateJsonExists": private_json.exists(),
        "reportExists": report.exists(),
        "trackedLeakCount": len(leaked),
        "trackedLeaks": leaked,
        "legacyPublicStaging": str(LEGACY_PUBLIC_STAGING_DIR),
        "distScan": dist_scan,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if not result["ok"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
