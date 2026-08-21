#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import sys


INGESTION_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(INGESTION_ROOT / "src"))

from lexicography_eval.cli import main  # noqa: E402


if __name__ == "__main__":
    sys.exit(main())
