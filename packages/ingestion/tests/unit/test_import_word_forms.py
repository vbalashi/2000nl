from pathlib import Path
import json
import sys

INGESTION_ROOT = Path(__file__).resolve().parents[2]  # packages/ingestion
sys.path.append(str(INGESTION_ROOT / "src"))
sys.path.append(str(INGESTION_ROOT / "scripts"))

from import_word_forms import collect_forms  # noqa: E402


def write_entry(path: Path, payload: dict) -> None:
    path.write_text(json.dumps([payload]), encoding="utf-8")


def test_collect_forms_keeps_meanings_separate(tmp_path: Path):
    write_entry(
        tmp_path / "bank_zn_1.json",
        {
            "headword": "bank",
            "meaning_id": 1,
            "plural": "banken",
            "meanings": [{"definition": "zitmeubel"}],
        },
    )
    write_entry(
        tmp_path / "bank_zn_2.json",
        {
            "headword": "bank",
            "meaning_id": 2,
            "alternate_headwords": ["bankinstelling"],
            "meanings": [{"definition": "financiele instelling"}],
        },
    )

    forms = collect_forms(tmp_path)

    assert ("bank", 1) in forms
    assert ("bank", 2) in forms
    assert "banken" in forms[("bank", 1)]
    assert "bankinstelling" not in forms[("bank", 1)]
    assert "bankinstelling" in forms[("bank", 2)]
