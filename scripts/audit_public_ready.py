from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DENIED_TRACKED_EXTENSIONS = {
    ".aab",
    ".apk",
    ".db",
    ".doc",
    ".docx",
    ".env",
    ".jks",
    ".key",
    ".keystore",
    ".p12",
    ".pdf",
    ".pem",
    ".pfx",
    ".sqlite",
    ".xlsx",
    ".zip",
}
DENIED_TRACKED_NAMES = {
    ".env",
    "google-services.json",
    "keystore.properties",
    "local.properties",
}
RUNTIME_PUBLIC_DIRS = [
    REPO_ROOT / "apps" / "reader" / "public" / "content",
    REPO_ROOT / "content" / "processed",
    REPO_ROOT / "content" / "source",
    REPO_ROOT / "apps" / "reader" / "src" / "generated",
]
RUNTIME_FORBIDDEN_TOKENS = [
    "C:\\",
    "enDocx",
    "zhDocx",
    "sourcePdf",
]


def run_git(args: list[str]) -> list[str]:
    completed = subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )
    return [line.strip() for line in completed.stdout.splitlines() if line.strip()]


def fail(messages: list[str]) -> None:
    print("public readiness audit failed:")
    for message in messages:
        print(f"- {message}")
    raise SystemExit(1)


def is_denied_tracked_path(path_text: str) -> bool:
    path = Path(path_text)
    name = path.name.lower()
    suffix = path.suffix.lower()
    if name.endswith(".example"):
        return False
    return name in DENIED_TRACKED_NAMES or suffix in DENIED_TRACKED_EXTENSIONS


def check_tracked_files() -> list[str]:
    errors: list[str] = []
    for tracked in run_git(["ls-files"]):
        if is_denied_tracked_path(tracked):
            errors.append(f"tracked denied file: {tracked}")
    return errors


def check_runtime_public_json() -> list[str]:
    errors: list[str] = []
    for root in RUNTIME_PUBLIC_DIRS:
        if not root.exists():
            continue
        for path in root.rglob("*.json"):
            text = path.read_text(encoding="utf-8")
            for token in RUNTIME_FORBIDDEN_TOKENS:
                if token in text:
                    errors.append(f"runtime JSON contains forbidden token {token!r}: {path.relative_to(REPO_ROOT)}")
    return errors


def check_worktree_sensitive_files() -> list[str]:
    """Report sensitive local files. This mode is for local pre-release inspection."""
    warnings: list[str] = []
    for relative in [
        "android/keystore.properties",
        "android/local.properties",
        "android/app/build/outputs/apk/release/app-release.apk",
        "android/app/build/outputs/bundle/release/app-release.aab",
    ]:
        path = REPO_ROOT / relative
        if path.exists():
            ignored = subprocess.run(
                ["git", "check-ignore", "-q", relative],
                cwd=REPO_ROOT,
                text=True,
            ).returncode == 0
            state = "ignored" if ignored else "not ignored"
            warnings.append(f"local sensitive/build file present ({state}): {relative}")
    return warnings


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit repository content before public release.")
    parser.add_argument("--worktree", action="store_true", help="also report local ignored secret/build files")
    args = parser.parse_args()

    errors = []
    errors.extend(check_tracked_files())
    errors.extend(check_runtime_public_json())
    if errors:
        fail(errors)

    print("ok: tracked-file denylist passed")
    print("ok: runtime public JSON contains no local source paths")
    if args.worktree:
        for warning in check_worktree_sensitive_files():
            print(f"note: {warning}")


if __name__ == "__main__":
    main()
