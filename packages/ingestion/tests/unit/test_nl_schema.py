import json
from pathlib import Path

from jsonschema import Draft202012Validator


REPO_ROOT = Path(__file__).resolve().parents[4]
SCHEMA_PATH = REPO_ROOT / "packages" / "shared" / "schemas" / "nl" / "note.schema.json"
DATA_ROOT = REPO_ROOT / "db" / "data" / "words_content"


def _load_entry(name: str) -> dict:
    payload = json.loads((DATA_ROOT / name).read_text(encoding="utf-8"))
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
