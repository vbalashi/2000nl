from __future__ import annotations

import json
from pathlib import Path
import sys

import pytest


INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))

from importer.reconciliation import load_reconciliation_plan  # noqa: E402


def _write_plan(path: Path) -> None:
    path.write_text(
        json.dumps(
            {
                "format_version": "source-reconciliation-plan-v1",
                "manifest_sha256": "a" * 64,
                "identity_scheme_version": "vandale-provider-article-v1",
                "dictionary_slug": "nl-vandale",
                "existing_uuid_set_sha256": "b" * 64,
                "decisions": [
                    {
                        "source_entry_key": "source:1",
                        "action": "bind-existing",
                        "word_entry_id": "11111111-1111-4111-8111-111111111111",
                        "expected_raw_fingerprint": "c" * 64,
                        "method": "legacy-payload-exact",
                        "reason": "Unique legacy payload match.",
                    },
                    {
                        "source_entry_key": "source:2",
                        "action": "insert-new",
                        "word_entry_id": None,
                        "expected_raw_fingerprint": None,
                        "method": "approved-restored-artifact",
                        "reason": "No historical UUID exists for this source artifact.",
                    },
                ],
            }
        ),
        encoding="utf-8",
    )


def test_loads_complete_reconciliation_plan(tmp_path: Path) -> None:
    path = tmp_path / "plan.json"
    _write_plan(path)

    plan = load_reconciliation_plan(
        path,
        manifest_sha256="a" * 64,
        identity_scheme_version="vandale-provider-article-v1",
        dictionary_slug="nl-vandale",
        source_entry_keys={"source:1", "source:2"},
    )

    assert len(plan.decisions) == 2
    assert plan.decisions["source:1"].action == "bind-existing"
    assert plan.decisions["source:2"].action == "insert-new"


def test_rejects_plan_that_omits_an_artifact(tmp_path: Path) -> None:
    path = tmp_path / "plan.json"
    _write_plan(path)

    with pytest.raises(ValueError, match="decision set"):
        load_reconciliation_plan(
            path,
            manifest_sha256="a" * 64,
            identity_scheme_version="vandale-provider-article-v1",
            dictionary_slug="nl-vandale",
            source_entry_keys={"source:1", "source:2", "source:3"},
        )


def test_rejects_competing_existing_uuid_assignments(tmp_path: Path) -> None:
    path = tmp_path / "plan.json"
    _write_plan(path)
    payload = json.loads(path.read_text(encoding="utf-8"))
    payload["decisions"][1].update(
        {
            "action": "bind-existing",
            "word_entry_id": payload["decisions"][0]["word_entry_id"],
            "expected_raw_fingerprint": "d" * 64,
            "method": "legacy-payload-exact",
        }
    )
    path.write_text(json.dumps(payload), encoding="utf-8")

    with pytest.raises(ValueError, match="assigned more than once"):
        load_reconciliation_plan(
            path,
            manifest_sha256="a" * 64,
            identity_scheme_version="vandale-provider-article-v1",
            dictionary_slug="nl-vandale",
            source_entry_keys={"source:1", "source:2"},
        )
