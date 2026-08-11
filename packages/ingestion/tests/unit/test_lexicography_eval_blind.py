from __future__ import annotations

import json
from pathlib import Path
import sys


INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))

from lexicography_eval.blind import render_blind_review  # noqa: E402


def test_render_blind_review_hides_origin_and_supports_local_export(tmp_path: Path) -> None:
    sample = {
        "schema": "lexicography-sample-v1",
        "benchmarkId": "blind-test",
        "cases": [
            {
                "caseId": "lex_bank",
                "split": "holdout",
                "generationInput": {
                    "headword": "bank",
                    "languageCode": "nl",
                    "partOfSpeech": "zn",
                },
            }
        ],
    }
    protected = {
        "schema": "lexicography-protected-references-v1",
        "benchmarkId": "blind-test",
        "cases": [
            {
                "caseId": "lex_bank",
                "references": [
                    {
                        "definition": "een bedrijf dat geld bewaart",
                        "examples": ["Zij werkt bij een bank."],
                        "idioms": [],
                    }
                ],
            }
        ],
    }
    candidates = tmp_path / "candidates"
    candidates.mkdir()
    (candidates / "lex_bank.json").write_text(
        json.dumps(
            {
                "schema": "lexicography-candidate-v1",
                "caseId": "lex_bank",
                "promptId": "secret-prompt-id",
                "promptHash": "secret-prompt-hash",
                "content": {
                    "headword": "bank",
                    "partOfSpeech": "zn",
                    "senses": [
                        {
                            "definition": "Een bedrijf waar je geld bewaart of leent.",
                            "usageNote": None,
                            "usagePattern": None,
                            "examples": ["Mijn salaris komt op mijn rekening."],
                            "collocations": ["geld lenen"],
                            "synonyms": [],
                            "idioms": [],
                        }
                    ],
                },
            }
        ),
        encoding="utf-8",
    )
    output_html = tmp_path / "review.html"
    mapping_path = tmp_path / "mapping.json"

    result = render_blind_review(
        sample=sample,
        protected=protected,
        candidate_dir=candidates,
        output_html=output_html,
        mapping_path=mapping_path,
        split="holdout",
        seed="fixed-seed",
        repeat_count=1,
    )

    assert result.original_item_count == 1
    assert result.total_item_count == 2
    html = output_html.read_text(encoding="utf-8")
    lowered = html.lower()
    assert "vandale" not in lowered
    assert "secret-prompt" not in lowered
    assert "sourceentry" not in lowered
    assert "localstorage" in lowered
    assert "export json" in lowered
    assert "export csv" in lowered
    assert "a is beter" in lowered
    assert "beide zijn slecht" in lowered

    mapping = json.loads(mapping_path.read_text(encoding="utf-8"))
    assert mapping["schema"] == "lexicography-blind-mapping-v1"
    assert len(mapping["items"]) == 2
    original = next(item for item in mapping["items"] if item["repeatedFrom"] is None)
    repeated = next(item for item in mapping["items"] if item["repeatedFrom"] is not None)
    assert repeated["repeatedFrom"] == original["itemId"]
    assert original["sideA"] != repeated["sideA"]
    assert mapping["reviewBundleId"].startswith("blind_")
    assert mapping["sampleHash"]
    assert mapping["protectedHash"]
    assert mapping["candidateBundleHash"]
    assert "bundleMetadata:data.metadata" in html
    assert 'lines.join("\\n")' in html
    assert 'lines.join("\n")' not in html


def test_blind_repeats_are_interleaved_with_minimum_spacing(tmp_path: Path) -> None:
    cases = []
    protected_cases = []
    candidates = tmp_path / "candidates"
    candidates.mkdir()
    for index in range(12):
        case_id = f"case-{index}"
        headword = f"woord-{index}"
        cases.append(
            {
                "caseId": case_id,
                "split": "validation",
                "generationInput": {
                    "headword": headword,
                    "languageCode": "nl",
                    "partOfSpeech": "zn",
                },
            }
        )
        protected_cases.append(
            {
                "caseId": case_id,
                "references": [{"definition": f"bron {index}", "examples": []}],
            }
        )
        (candidates / f"{case_id}.json").write_text(
            json.dumps(
                {
                    "schema": "lexicography-candidate-v1",
                    "caseId": case_id,
                    "promptId": "finalist-d",
                    "promptHash": "prompt-hash",
                    "content": {
                        "headword": headword,
                        "partOfSpeech": "zn",
                        "senses": [{"definition": f"definitie {index}"}],
                    },
                }
            ),
            encoding="utf-8",
        )

    render_blind_review(
        sample={
            "schema": "lexicography-sample-v1",
            "benchmarkId": "interleaved",
            "selectionHash": "selection-hash",
            "cases": cases,
        },
        protected={
            "schema": "lexicography-protected-references-v1",
            "benchmarkId": "interleaved",
            "cases": protected_cases,
        },
        candidate_dir=candidates,
        output_html=tmp_path / "review.html",
        mapping_path=tmp_path / "mapping.json",
        split="validation",
        seed="spacing-seed",
        repeat_count=4,
    )

    items = json.loads((tmp_path / "mapping.json").read_text(encoding="utf-8"))["items"]
    positions = {item["itemId"]: index for index, item in enumerate(items)}
    repeats = [item for item in items if item["repeatedFrom"]]
    assert all(abs(positions[item["itemId"]] - positions[item["repeatedFrom"]]) >= 3 for item in repeats)
    assert any(item["repeatedFrom"] for item in items[:-4])


def test_blind_all_split_can_read_candidates_from_multiple_runs(tmp_path: Path) -> None:
    sample = {
        "schema": "lexicography-sample-v1",
        "benchmarkId": "all-test",
        "cases": [],
    }
    protected = {
        "schema": "lexicography-protected-references-v1",
        "benchmarkId": "all-test",
        "cases": [],
    }
    candidate_dirs = [tmp_path / "development", tmp_path / "holdout"]
    for root in candidate_dirs:
        root.mkdir()
    for index, split in enumerate(("development", "holdout")):
        case_id = f"case-{index}"
        word = f"woord-{index}"
        sample["cases"].append(
            {
                "caseId": case_id,
                "split": split,
                "generationInput": {"headword": word, "partOfSpeech": "zn"},
            }
        )
        protected["cases"].append(
            {"caseId": case_id, "references": [{"definition": f"bron {index}"}]}
        )
        (candidate_dirs[index] / f"{case_id}.json").write_text(
            json.dumps(
                {
                    "schema": "lexicography-candidate-v1",
                    "caseId": case_id,
                    "promptId": "h",
                    "content": {
                        "headword": word,
                        "partOfSpeech": "zn",
                        "senses": [{"definition": f"nieuw {index}"}],
                    },
                }
            ),
            encoding="utf-8",
        )

    result = render_blind_review(
        sample=sample,
        protected=protected,
        candidate_dir=candidate_dirs,
        output_html=tmp_path / "all.html",
        mapping_path=tmp_path / "all-mapping.json",
        split="all",
        seed="all-seed",
        repeat_count=0,
    )

    assert result.original_item_count == 2
