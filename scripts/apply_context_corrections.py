from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

from context_corrections import apply_context_corrections_to_manual, load_canonical_bundle


REPO_ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply accepted context corrections to runtime manual data.")
    parser.add_argument("--repo-root", type=Path, default=REPO_ROOT)
    args = parser.parse_args()
    manual_path = args.repo_root / "content" / "processed" / "manual.json"
    public_path = args.repo_root / "apps" / "reader" / "public" / "content" / "manual.json"
    manual = json.loads(manual_path.read_text(encoding="utf-8"))
    applied = apply_context_corrections_to_manual(manual, load_canonical_bundle(args.repo_root))
    manual_path.write_text(json.dumps(manual, ensure_ascii=False, indent=2), encoding="utf-8")
    shutil.copyfile(manual_path, public_path)
    print(json.dumps({"ok": True, "applied": applied}, ensure_ascii=False))


if __name__ == "__main__":
    main()
