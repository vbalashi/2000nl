import sys
from pathlib import Path

INGESTION_ROOT = Path(__file__).resolve().parents[2]  # packages/ingestion
sys.path.append(str(INGESTION_ROOT / "src"))
sys.path.append(str(INGESTION_ROOT / "scripts"))

from import_word_forms import (  # noqa: E402
    collect_source_forms,
    load_source_binding_ids,
    validate_source_binding_coverage,
)


def test_collect_source_forms_keeps_colliding_natural_keys_separate(
    tmp_path: Path,
    monkeypatch,
):
    class Artifact:
        def __init__(self, source_entry_key: str, payload: dict):
            self.source_entry_key = source_entry_key
            self.payload = payload

    class Manifest:
        identity_scheme_version = "vandale-provider-article-v1"
        manifest_sha256 = "manifest-checksum"
        artifacts = (
            Artifact(
                "source-key-a",
                {
                    "headword": "bank",
                    "meaning_id": 1,
                    "plural": "banken",
                    "meanings": [{"definition": "zitmeubel"}],
                },
            ),
            Artifact(
                "source-key-b",
                {
                    "headword": "bank",
                    "meaning_id": 1,
                    "alternate_headwords": ["bankinstelling"],
                    "meanings": [{"definition": "financiële instelling"}],
                },
            ),
        )

    monkeypatch.setattr(
        "import_word_forms.load_source_manifest",
        lambda _data_dir: Manifest(),
    )

    scheme, manifest_checksum, forms = collect_source_forms(tmp_path)

    assert scheme == "vandale-provider-article-v1"
    assert manifest_checksum == "manifest-checksum"
    assert forms["source-key-a"] == ("bank", ["bank", "banken"])
    assert forms["source-key-b"] == ("bank", ["bank", "bankinstelling"])


def test_validate_source_binding_coverage_rejects_missing_or_extra_bindings():
    forms = {
        "source-key-a": ("bank", ["bank", "banken"]),
        "source-key-b": ("bank", ["bank", "bankinstelling"]),
    }

    try:
        validate_source_binding_coverage(
            forms,
            {"source-key-a": "00000000-0000-0000-0000-000000000001"},
        )
    except RuntimeError as error:
        assert "missing 1" in str(error)
    else:
        raise AssertionError("missing source binding must fail closed")

    try:
        validate_source_binding_coverage(
            forms,
            {
                "source-key-a": "00000000-0000-0000-0000-000000000001",
                "source-key-b": "00000000-0000-0000-0000-000000000002",
                "source-key-c": "00000000-0000-0000-0000-000000000003",
            },
        )
    except RuntimeError as error:
        assert "extra 1" in str(error)
    else:
        raise AssertionError("extra active source binding must fail closed")


def test_load_source_binding_ids_rejects_another_manifest():
    class Cursor:
        def execute(self, _query, _parameters):
            return None

        def fetchall(self):
            return [
                (
                    "source-key-a",
                    "00000000-0000-0000-0000-000000000001",
                    "previous-manifest",
                )
            ]

    try:
        load_source_binding_ids(
            Cursor(),
            "00000000-0000-0000-0000-000000000010",
            "vandale-provider-article-v1",
            "current-manifest",
        )
    except RuntimeError as error:
        assert "different manifest" in str(error)
    else:
        raise AssertionError("forms must not precede the matching entry import")
