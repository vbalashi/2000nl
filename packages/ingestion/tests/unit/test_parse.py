import os
from pathlib import Path
import sys

INGESTION_ROOT = Path(__file__).resolve().parents[2]  # packages/ingestion
REPO_ROOT = INGESTION_ROOT.parents[1]
sys.path.append(str(INGESTION_ROOT / "src"))

from importer.dictionary_entry_parser import parse_dictionary_file  # noqa: E402

DATA_ROOT = Path(
    os.environ.get(
        "VANDALE_DATA_ROOT",
        INGESTION_ROOT / "tests" / "fixtures" / "legacy_words",
    )
)


def _entry_path(name: str) -> Path:
    path = DATA_ROOT / name
    if path.is_file():
        return path
    matches = list(DATA_ROOT.glob(f"*_{name}"))
    if len(matches) != 1:
        raise FileNotFoundError(
            f"Expected one legacy or versioned artifact for {name}, "
            f"found {len(matches)}"
        )
    return matches[0]


def test_parses_nt2_verb_entry():
    entry = parse_dictionary_file(_entry_path("aanbranden_ww_1.json"))

    assert entry.headword == "aanbranden"
    assert entry.meaning_id == 1
    assert entry.part_of_speech == "ww"
    assert entry.is_nt2_2000 is False
    # Raw JSON is preserved for downstream storage
    assert "brandde aan" in entry.raw["verb_forms"]


def test_handles_idioms_list_shape():
    entry = parse_dictionary_file(_entry_path("aan_bw_1.json"))

    assert entry.headword == "aan"
    assert entry.meaning_id == 1
    assert entry.part_of_speech == "bw"
    idioms = entry.raw["meanings"][0]["idioms"]
    assert isinstance(idioms, list)


def test_cross_references_and_empty_meanings_work():
    entry = parse_dictionary_file(_entry_path("ouwe_bn_1.json"))

    assert entry.headword == "ouwe"
    assert entry.meaning_id == 1
    assert entry.part_of_speech == "bn"
    assert entry.is_nt2_2000 is False
    assert entry.raw["cross_reference"] == "2oud"
    assert entry.raw["meanings"] == []


def test_meaning_id_uses_payload_or_filename_suffix():
    entry = parse_dictionary_file(_entry_path("ergens_bw_2.json"))

    assert entry.headword == "ergens"
    assert entry.meaning_id == 2
    assert entry.part_of_speech == "bw"
    assert entry.is_nt2_2000 is True


def test_parses_versioned_source_identity(tmp_path: Path):
    path = tmp_path / "000042_a123_voorbeeld_zn_1.json"
    path.write_text(
        """
        [{
          "headword": "voorbeeld",
          "part_of_speech": "zn",
          "meanings": [{"definition": "een illustratie"}],
          "meaning_id": 1,
          "_source": {
            "identity_scheme_version": "vandale-provider-article-v1",
            "source_entry_key": "fnt:vandale-provider-article-v1:opaque:1",
            "source_group_key": "fnt:vandale-provider-article-v1:opaque",
            "source_index": 42,
            "sense_ordinal": 1,
            "normalized_pos_status": "known"
          }
        }]
        """,
        encoding="utf-8",
    )

    entry = parse_dictionary_file(path)

    assert entry.identity_scheme_version == "vandale-provider-article-v1"
    assert entry.source_entry_key.endswith(":1")
    assert entry.source_group_key.endswith(":opaque")
    assert entry.normalized_pos_status == "known"
