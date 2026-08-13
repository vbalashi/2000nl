from __future__ import annotations

import json
from pathlib import Path
import sys


INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))

from importer.pointer_meanings import audit_pointer_meanings  # noqa: E402


def _write_entry(
    root: Path,
    filename: str,
    *,
    headword: str,
    definition: str,
    examples: list[str] | None = None,
) -> None:
    (root / filename).write_text(
        json.dumps(
            [
                {
                    "headword": headword,
                    "meaning_id": 1,
                    "meanings": [
                        {
                            "definition": definition,
                            "context": "",
                            "examples": examples or [],
                            "idioms": [],
                        }
                    ],
                }
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def test_audit_classifies_a_bounded_sample_without_redirecting_all_hyphens(
    tmp_path: Path,
) -> None:
    _write_entry(
        tmp_path,
        "01_daar.json",
        headword="daar",
        definition="daar-",
    )
    _write_entry(
        tmp_path,
        "02_daar-target.json",
        headword="daar-",
        definition="samen met een voorzetsel gebruikt",
        examples=["wat bedoel je daarmee?"],
    )
    _write_entry(
        tmp_path,
        "03_literal.json",
        headword="AIVD",
        definition="Algemene Inlichtingen- en Veiligheidsdienst",
    )
    _write_entry(
        tmp_path,
        "04_unresolved.json",
        headword="los",
        definition="nergens-",
    )
    _write_entry(
        tmp_path,
        "05_supported.json",
        headword="daaraan",
        definition="daar-",
        examples=["hij is daaraan gewend"],
    )

    audit = audit_pointer_meanings(tmp_path, sample_limit=4)

    assert audit["sampleLimit"] == 4
    assert audit["sampledEntries"] == 4
    assert audit["corpusEntries"] == 5
    assert audit["counts"] == {
        "resolvablePointerOnly": 1,
        "unresolvedPointerShape": 1,
        "hyphenatedContent": 1,
    }
    assert audit["candidates"] == [
        {
            "artifact": "01_daar.json",
            "headword": "daar",
            "meaningId": 1,
            "target": "daar-",
            "classification": "resolvable-pointer-only",
        },
        {
            "artifact": "04_unresolved.json",
            "headword": "los",
            "meaningId": 1,
            "target": "nergens-",
            "classification": "unresolved-pointer-shape",
        },
    ]
