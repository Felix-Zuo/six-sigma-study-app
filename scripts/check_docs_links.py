from __future__ import annotations

import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DOCS = [REPO_ROOT / "README.md", *sorted((REPO_ROOT / "docs").rglob("*.md"))]
LINK_RE = re.compile(r"!?\[[^\]]*]\(([^)]+)\)")


def is_external(target: str) -> bool:
    return target.startswith(("http://", "https://", "mailto:", "#"))


def clean_target(target: str) -> str:
    target = target.strip()
    if target.startswith("<") and target.endswith(">"):
        target = target[1:-1]
    return target.split("#", 1)[0]


def main() -> None:
    failures: list[str] = []
    for doc in DOCS:
        text = doc.read_text(encoding="utf-8")
        for match in LINK_RE.finditer(text):
            raw_target = match.group(1)
            target = clean_target(raw_target)
            if not target or is_external(target):
                continue
            candidate = (doc.parent / target).resolve()
            try:
                candidate.relative_to(REPO_ROOT)
            except ValueError:
                failures.append(f"{doc.relative_to(REPO_ROOT)} links outside repo: {raw_target}")
                continue
            if not candidate.exists():
                failures.append(f"{doc.relative_to(REPO_ROOT)} missing link target: {raw_target}")
    if failures:
        print("documentation link check failed:")
        for failure in failures:
            print(f"- {failure}")
        raise SystemExit(1)
    print(f"ok: checked {len(DOCS)} markdown files")


if __name__ == "__main__":
    main()
