from __future__ import annotations

import os
from pathlib import Path
import sys


def main() -> None:
    """Delegate to the single supported, manifest-aware importer."""
    repo_root = Path(__file__).resolve().parents[3]
    importer = (
        repo_root
        / "packages"
        / "ingestion"
        / "scripts"
        / "import_words_db.py"
    )
    os.execv(
        sys.executable,
        [sys.executable, str(importer), *sys.argv[1:]],
    )


if __name__ == "__main__":
    main()
