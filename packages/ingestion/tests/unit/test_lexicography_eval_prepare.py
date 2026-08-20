from __future__ import annotations

import json
from pathlib import Path
import sys

import pytest


INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))

from lexicography_eval.benchmark import (  # noqa: E402
    combine_review_bundles,
    prepare_benchmark,
)


def _write_sense(
    root: Path,
    *,
    filename: str,
    meaning_id: int,
    definition: str,
    example: str,
) -> None:
    payload = {
        "headword": "bank",
        "part_of_speech": "zn",
        "gender": "de",
        "plural": "banken",
        "meaning_id": meaning_id,
        "meanings": [
            {
                "definition": definition,
                "context": "",
                "examples": [example],
                "idioms": [],
            }
        ],
        "source_identity": {"provider_article_id": "a911"},
        "_source": {
            "source_entry_key": f"fnt:test:bank:{meaning_id}",
            "source_group_key": "fnt:test:bank",
            "sense_ordinal": meaning_id,
        },
        "_raw_html": "<strong>protected source markup</strong>",
    }
    (root / filename).write_text(
        json.dumps([payload], ensure_ascii=False),
        encoding="utf-8",
    )


def test_prepare_separates_safe_generation_input_from_protected_references(
    tmp_path: Path,
) -> None:
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    _write_sense(
        corpus,
        filename="000918_a911_bank_zn_1.json",
        meaning_id=1,
        definition="een meubel om op te zitten",
        example="We zitten samen op de bank.",
    )
    _write_sense(
        corpus,
        filename="000918_a911_bank_zn_2.json",
        meaning_id=2,
        definition="een bedrijf dat geld bewaart",
        example="Zij werkt bij een bank.",
    )
    selection = {
        "schema": "lexicography-selection-v1",
        "benchmarkId": "test-benchmark",
        "lemmas": [
            {
                "headword": "bank",
                "partOfSpeech": "zn",
                "selectedMeaningIds": [1, 2],
                "split": "development",
            }
        ],
    }
    public_path = tmp_path / "sample.json"
    protected_path = tmp_path / "references.json"

    prepared = prepare_benchmark(
        corpus_root=corpus,
        selection=selection,
        public_path=public_path,
        protected_path=protected_path,
    )

    assert prepared.case_count == 1
    assert prepared.meaning_count == 2
    public = json.loads(public_path.read_text(encoding="utf-8"))
    protected = json.loads(protected_path.read_text(encoding="utf-8"))

    case = public["cases"][0]
    assert case["generationInput"] == {
        "headword": "bank",
        "languageCode": "nl",
        "partOfSpeech": "zn",
        "grammar": {"gender": "de", "plural": "banken"},
    }
    serialized_input = json.dumps(case["generationInput"], ensure_ascii=False)
    for forbidden in (
        "meubel",
        "geld bewaart",
        "We zitten",
        "Zij werkt",
        "a911",
        "source_entry_key",
        "_raw_html",
    ):
        assert forbidden not in serialized_input

    references = protected["cases"][0]["references"]
    assert [item["meaningId"] for item in references] == [1, 2]
    assert references[0]["definition"] == "een meubel om op te zitten"
    assert "_raw_html" not in json.dumps(protected)

    first_public = public_path.read_bytes()
    first_protected = protected_path.read_bytes()
    prepare_benchmark(
        corpus_root=corpus,
        selection=selection,
        public_path=public_path,
        protected_path=protected_path,
    )
    assert public_path.read_bytes() == first_public
    assert protected_path.read_bytes() == first_protected


def test_prepare_physically_seals_holdout_cases(tmp_path: Path) -> None:
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    _write_sense(
        corpus,
        filename="000918_a911_bank_zn_1.json",
        meaning_id=1,
        definition="een bedrijf dat geld bewaart",
        example="Zij werkt bij een bank.",
    )
    selection = {
        "schema": "lexicography-selection-v1",
        "benchmarkId": "sealed-test",
        "lemmas": [
            {
                "headword": "bank",
                "partOfSpeech": "zn",
                "selectedMeaningIds": [1],
                "split": "holdout",
            }
        ],
    }
    public_path = tmp_path / "sample.json"
    protected_path = tmp_path / "references.json"
    release_dir = tmp_path / "holdout-release"
    holdout_path = release_dir / "sealed-holdout.json"
    holdout_protected_path = release_dir / "protected-references.json"
    holdout_ledger_path = release_dir / "release-ledger.json"

    result = prepare_benchmark(
        corpus_root=corpus,
        selection=selection,
        public_path=public_path,
        protected_path=protected_path,
        holdout_path=holdout_path,
        holdout_protected_path=holdout_protected_path,
        holdout_ledger_path=holdout_ledger_path,
    )

    public = json.loads(public_path.read_text(encoding="utf-8"))
    protected = json.loads(protected_path.read_text(encoding="utf-8"))
    holdout = json.loads(holdout_path.read_text(encoding="utf-8"))
    holdout_protected = json.loads(
        holdout_protected_path.read_text(encoding="utf-8")
    )
    ledger = json.loads(holdout_ledger_path.read_text(encoding="utf-8"))
    assert public["cases"] == []
    assert protected["cases"] == []
    assert holdout["sealed"] is True
    assert holdout["cases"][0]["generationInput"]["headword"] == "bank"
    assert holdout_protected["cases"][0]["references"][0]["definition"]
    assert ledger["sampleSha256"] == result.holdout_sha256
    assert ledger["protectedSha256"] == result.holdout_protected_sha256
    assert result.holdout_sha256

    combined = combine_review_bundles(
        open_sample=public,
        holdout_sample=holdout,
        open_protected=protected,
        holdout_protected=holdout_protected,
        public_path=tmp_path / "combined-sample.json",
        protected_path=tmp_path / "combined-protected.json",
    )
    assert combined.case_count == 1
    assert combined.meaning_count == 1

    with pytest.raises(FileExistsError, match="Immutable holdout artifact"):
        prepare_benchmark(
            corpus_root=corpus,
            selection=selection,
            public_path=public_path,
            protected_path=protected_path,
            holdout_path=holdout_path,
            holdout_protected_path=holdout_protected_path,
            holdout_ledger_path=holdout_ledger_path,
        )


def test_prepare_rejects_meanings_from_different_provider_articles(tmp_path: Path) -> None:
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    _write_sense(
        corpus, filename="one.json", meaning_id=1,
        definition="eerste betekenis", example="Dit is één.",
    )
    _write_sense(
        corpus, filename="two.json", meaning_id=2,
        definition="tweede betekenis", example="Dit is twee.",
    )
    second_path = corpus / "two.json"
    second = json.loads(second_path.read_text(encoding="utf-8"))
    second[0]["_source"]["source_group_key"] = "fnt:test:other-bank"
    second_path.write_text(json.dumps(second), encoding="utf-8")

    with pytest.raises(ValueError, match="provider article groups"):
        prepare_benchmark(
            corpus_root=corpus,
            selection={
                "schema": "lexicography-selection-v1",
                "benchmarkId": "test",
                "lemmas": [{
                    "headword": "bank", "partOfSpeech": "zn",
                    "selectedMeaningIds": [1, 2], "split": "development",
                }],
            },
            public_path=tmp_path / "sample.json",
            protected_path=tmp_path / "protected.json",
        )


def test_prepare_rejects_a_meaning_without_provider_article_identity(
    tmp_path: Path,
) -> None:
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    _write_sense(
        corpus, filename="one.json", meaning_id=1,
        definition="eerste betekenis", example="Dit is één.",
    )
    _write_sense(
        corpus, filename="two.json", meaning_id=2,
        definition="tweede betekenis", example="Dit is twee.",
    )
    second_path = corpus / "two.json"
    second = json.loads(second_path.read_text(encoding="utf-8"))
    second[0].pop("_source")
    second_path.write_text(json.dumps(second), encoding="utf-8")

    with pytest.raises(ValueError, match="provider article groups"):
        prepare_benchmark(
            corpus_root=corpus,
            selection={
                "schema": "lexicography-selection-v1",
                "benchmarkId": "test",
                "lemmas": [{
                    "headword": "bank", "partOfSpeech": "zn",
                    "selectedMeaningIds": [1, 2], "split": "development",
                }],
            },
            public_path=tmp_path / "sample.json",
            protected_path=tmp_path / "protected.json",
        )
