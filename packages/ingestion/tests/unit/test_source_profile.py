from __future__ import annotations

import json
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from importer import core, source_profile
from importer.source_manifest import ARTIFACT_FINGERPRINT_VERSION


def test_import_defaults_preserve_configured_catalog_and_fingerprint(tmp_path, monkeypatch):
    (tmp_path / "_manifest.jsonl").write_text("")
    monkeypatch.setattr(core, "import_source_manifest", lambda **kwargs: kwargs)
    forwarded = core.import_entries(tmp_path, "unused-test-connection")
    mapping = {
        "nt2_name": "coreListName", "dictionary_slug": "catalogKey",
        "dictionary_name": "dictionaryName", "dictionary_description": "dictionaryDescription",
        "dictionary_schema_key": "schemaKeyV2", "dictionary_source_provider": "sourceProvider",
    }
    for argument, setting in mapping.items():
        assert forwarded[argument] == source_profile.source_profile_value(setting)
    assert ARTIFACT_FINGERPRINT_VERSION == source_profile.source_profile_value("fingerprintVersion")
    explicit = core.import_entries(tmp_path, "unused-test-connection", dictionary_slug="custom-catalog")
    assert explicit["dictionary_slug"] == "custom-catalog"


@pytest.mark.parametrize("payload", ["not-json", "[]", "{}", json.dumps({"displayName": ""}), json.dumps({"displayName": 42})])
def test_invalid_profile_does_not_echo_resource_contents(tmp_path, monkeypatch, payload):
    profile = tmp_path / "profile.json"
    profile.write_text(payload)
    monkeypatch.setattr(source_profile, "PROFILE_PATH", profile)
    with pytest.raises(ValueError, match="^invalid_dictionary_source_profile$"):
        source_profile.source_profile_value("displayName")


def test_external_profile_preserves_private_identity_without_changing_public_defaults(monkeypatch, tmp_path):
    original = source_profile.PROFILE_PATH.read_bytes()
    monkeypatch.setenv("DICTIONARY_SOURCE_PROFILE_JSON", json.dumps({"fingerprintVersion": "installed-version-v1", "sourceRankKey": "installedReference"}))
    assert source_profile.source_profile_value("fingerprintVersion") == "installed-version-v1"
    assert source_profile.source_profile_value("sourceRankKey") == "installedReference"
    assert source_profile.PROFILE_PATH.read_bytes() == original
    monkeypatch.delenv("DICTIONARY_SOURCE_PROFILE_JSON")
    private = tmp_path / "profile.json"
    private.write_text(json.dumps({"fingerprintVersion": "installed-version-v1"}))
    monkeypatch.setenv("DICTIONARY_SOURCE_PROFILE_FILE", str(private))
    assert source_profile.source_profile_value("fingerprintVersion") == "installed-version-v1"


@pytest.mark.parametrize("payload", ["[]", "not-json", json.dumps({"API_KEY": "private-marker"}), json.dumps({"sourceRankKey": ""})])
def test_external_profile_rejects_malformed_or_secret_shaped_settings(monkeypatch, payload):
    monkeypatch.setenv("DICTIONARY_SOURCE_PROFILE_JSON", payload)
    with pytest.raises(ValueError, match="^invalid_dictionary_source_profile$"):
        source_profile.source_profile_value("sourceRankKey")
