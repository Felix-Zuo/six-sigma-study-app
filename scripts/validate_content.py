from __future__ import annotations

import json
import sys
from pathlib import Path


def fail(message: str) -> None:
    raise SystemExit(f"content validation failed: {message}")


def validate(path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data.get("paragraphs"), list) or not data["paragraphs"]:
        fail("paragraphs must be a non-empty array")
    seen_ids: set[str] = set()
    for paragraph in data["paragraphs"]:
        for key in ["id", "page", "en", "zh"]:
            if key not in paragraph:
                fail(f"paragraph missing {key}: {paragraph!r}")
        if paragraph["id"] in seen_ids:
            fail(f"duplicate paragraph id: {paragraph['id']}")
        seen_ids.add(paragraph["id"])
        if not isinstance(paragraph["page"], int) or paragraph["page"] < 1:
            fail(f"invalid page for {paragraph['id']}")
        if not paragraph["en"].strip() or not paragraph["zh"].strip():
            fail(f"empty bilingual text for {paragraph['id']}")
    print(f"ok: {path} ({len(data['paragraphs'])} paragraphs)")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python scripts/validate_content.py <lesson.json>")
    validate(Path(sys.argv[1]))


if __name__ == "__main__":
    main()

