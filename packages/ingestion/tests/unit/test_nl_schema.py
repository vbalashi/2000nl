import pytest
import json
import os
import sys
from pathlib import Path

from jsonschema import Draft202012Validator


REPO_ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO_ROOT / "packages/ingestion/src"))
SCHEMA_PATH = REPO_ROOT / "packages" / "shared" / "schemas" / "nl" / "note.schema.json"
from importer.source_profile import source_profile_value

DATA_ROOT = Path(
    os.environ.get(
        "DICTIONARY_TEST_DATA_ROOT",
        os.environ.get(
            f"{source_profile_value('sourceProvider').upper()}_DATA_ROOT",
            REPO_ROOT / "packages/ingestion/tests/fixtures/legacy_words",
        ),
    )
)


def _load_entry(name: str) -> dict:
    path = DATA_ROOT / name
    if not path.is_file():
        matches = list(DATA_ROOT.glob(f"*_{name}"))
        if not matches:
            pytest.skip("Private corpus resource not supplied; set DICTIONARY_TEST_DATA_ROOT to run this unchanged assertion")
        if len(matches) != 1:
            raise FileNotFoundError(
                f"Expected one legacy or versioned artifact for {name}, "
                f"found {len(matches)}"
            )
        path = matches[0]
    payload = json.loads(path.read_text(encoding="utf-8"))
    assert payload
    return payload[0]


def test_nl_schema_accepts_regular_meaning_entry():
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)

    validator.validate(_load_entry("aan_vz_1.json"))


def test_nl_schema_accepts_cross_reference_only_entry():
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)

    validator.validate(_load_entry("ouwe_bn_1.json"))


def test_nl_schema_describes_structured_example_relations_and_identity():
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)

    validator.validate(
        {
            "headword": "voorbeeld",
            "part_of_speech_evidence": {
                "normalized_pos_status": "known",
                "source": "headword_html",
                "raw_value": "zn",
            },
            "alternate_headwords": [
                {
                    "headword": "voorbeelden",
                    "pronunciation": "voor·beel·den",
                    "gender": "de",
                    "plural": "",
                }
            ],
            "meanings": [
                {
                    "definition": "een definitie",
                    "context": "",
                    "examples": [],
                    "idioms": [
                        {
                            "expression": "bij wijze van voorbeeld",
                            "explanation": "als illustratie",
                            "examples": ["dit is maar een voorbeeld"],
                        }
                    ],
                    "synonyms": ["model"],
                    "antonyms": ["tegenvoorbeeld"],
                    "usage_labels": ["formeel"],
                    "grammar": {"plural": ["voorbeelden"]},
                    "pronunciation_note": "spreek de v duidelijk uit",
                    "note": "Aanvullende informatie.",
                    "cross_references": [
                        {"headword": "model", "meaning_id": 1}
                    ],
                }
            ],
            "reference_tables": [
                {
                    "title": "Voorbeeld",
                    "rows": [{"label": "meervoud", "value": "voorbeelden"}],
                }
            ],
            "source_identity": {
                "provider_article_id": "a123",
                "homograph_number": 2,
            },
            "_source": {
                "identity_scheme_version": "example-provider-article-v1",
                "identity_evidence": {
                    "dictionary_id": "fnt",
                    "headword_raw": "voorbeeld",
                    "provider_article_id": "a123",
                    "homograph_number": 2,
                },
                "provider_article_id": "a123",
                "normalized_pos_status": "known",
                "pos_evidence": {
                    "normalized_pos_status": "known",
                    "source": "headword_html",
                    "raw_value": "zn",
                },
                "source_group_key": "fnt:example-provider-article-v1:opaque",
                "source_entry_key": "fnt:example-provider-article-v1:opaque:1",
                "source_index": 42,
                "sense_ordinal": 1,
                "homograph_number": 2,
            },
            "meaning_id": 1,
        }
    )
