from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]  # packages/ingestion
sys.path.append(str(ROOT / "src"))

from importer.dictionary_entry_parser import parse_dictionary_file  # noqa: E402

DATA_ROOT = ROOT / "data" / "words_content"


def test_parses_nt2_verb_entry():
    entry = parse_dictionary_file(DATA_ROOT / "aanbranden_ww_1.json")

    assert entry.headword == "aanbranden"
    assert entry.meaning_id == 1
    assert entry.part_of_speech == "ww"
    assert entry.is_nt2_2000 is False
    # Raw JSON is preserved for downstream storage
    assert "brandde aan" in entry.raw["verb_forms"]


def test_handles_idioms_list_shape():
    entry = parse_dictionary_file(DATA_ROOT / "aan_bw_1.json")

    assert entry.headword == "aan"
    assert entry.meaning_id == 1
    assert entry.part_of_speech == "bw"
    idioms = entry.raw["meanings"][0]["idioms"]
    assert isinstance(idioms, list)


def test_cross_references_and_empty_meanings_work():
    entry = parse_dictionary_file(DATA_ROOT / "ouwe_bn_1.json")

    assert entry.headword == "ouwe"
    assert entry.meaning_id == 1
    assert entry.part_of_speech == "bn"
    assert entry.is_nt2_2000 is False
    assert entry.raw["cross_reference"] == "2oud"
    assert entry.raw["meanings"] == []


def test_meaning_id_uses_payload_or_filename_suffix():
    entry = parse_dictionary_file(DATA_ROOT / "ergens_bw_2.json")

    assert entry.headword == "ergens"
    assert entry.meaning_id == 2
    assert entry.part_of_speech == "bw"
    assert entry.is_nt2_2000 is True
