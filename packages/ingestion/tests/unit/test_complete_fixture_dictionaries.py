from __future__ import annotations

import sys
from pathlib import Path


INGESTION_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = INGESTION_ROOT.parent.parent
sys.path.insert(0, str(INGESTION_ROOT / "scripts"))

from generate_complete_fixture_dictionaries import _dictionaries  # noqa: E402


def test_complete_fixture_catalog_has_full_language_and_content_coverage() -> None:
    dictionaries = _dictionaries()
    assert {item["language"] for item in dictionaries} == {"nl", "en", "fr", "de"}

    for dictionary in dictionaries:
        entries = dictionary["entries"]
        assert len(entries) == 10
        assert {entry["payload"]["part_of_speech"] for entry in entries} >= {
            "zn",
            "ww",
            "bn",
            "bw",
        }
        for item in entries:
            payload = item["payload"]
            meaning = payload["meanings"][0]
            assert payload["_source"]["identity_scheme_version"] == "local-complete-fixture-v1"
            assert meaning["examples"]
            assert meaning["idioms"]
            assert meaning["definition"]
