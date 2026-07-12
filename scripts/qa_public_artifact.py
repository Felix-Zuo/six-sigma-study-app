from __future__ import annotations

import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DIST_ROOT = REPO_ROOT / "apps" / "reader" / "dist"


def has_content_private_path(parts: tuple[str, ...]) -> bool:
    return any(parts[index:index + 2] == ("content", "private") for index in range(len(parts) - 1))


def matching_rules(relative_path: Path) -> list[str]:
    parts = tuple(part.casefold() for part in relative_path.parts)
    name = relative_path.name.casefold()
    rules: list[str] = []
    if has_content_private_path(parts):
        rules.append("content/private")
    if name.endswith(".private.json"):
        rules.append("*.private.json")
    if name == "question-bank.private.json":
        rules.append("question-bank.private.json")
    return rules


def scan_artifact(artifact_root: Path = DIST_ROOT) -> dict:
    artifact_exists = artifact_root.exists() or artifact_root.is_symlink()
    artifact_is_directory = artifact_root.is_dir()
    violations: list[dict] = []
    scanned_entries = 0

    if not artifact_exists:
        violations.append({"path": ".", "type": "missing", "rules": ["artifact-missing"]})
    elif not artifact_is_directory:
        violations.append({"path": ".", "type": "non-directory", "rules": ["artifact-not-directory"]})
    else:
        paths = sorted(
            artifact_root.rglob("*"),
            key=lambda path: path.relative_to(artifact_root).as_posix().casefold(),
        )
        for path in paths:
            scanned_entries += 1
            relative_path = path.relative_to(artifact_root)
            rules = matching_rules(relative_path)
            if not rules:
                continue
            path_type = "symlink" if path.is_symlink() else "directory" if path.is_dir() else "file"
            violations.append(
                {
                    "path": relative_path.as_posix(),
                    "type": path_type,
                    "rules": rules,
                }
            )

    return {
        "ok": not violations,
        "artifactRoot": str(artifact_root),
        "artifactExists": artifact_exists,
        "artifactIsDirectory": artifact_is_directory,
        "scannedEntries": scanned_entries,
        "violationCount": len(violations),
        "violations": violations,
    }


def main() -> int:
    result = scan_artifact()
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
