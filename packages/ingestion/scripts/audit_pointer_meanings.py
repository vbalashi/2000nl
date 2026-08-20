#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from importer.pointer_meanings import audit_pointer_meanings  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Classify pointer-shaped meanings in a bounded source sample."
    )
    parser.add_argument("data_dir", type=Path)
    parser.add_argument("--limit", type=int, default=5000)
    arguments = parser.parse_args()
    print(
        json.dumps(
            audit_pointer_meanings(
                arguments.data_dir,
                sample_limit=arguments.limit,
            ),
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
