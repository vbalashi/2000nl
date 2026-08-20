from __future__ import annotations

import json
from pathlib import Path
import sys

import pytest


INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))

from lexicography_eval.blind import render_blind_review  # noqa: E402
from lexicography_eval_fixtures import write_bound_generation_run  # noqa: E402


def _article(headword: str, definition: str) -> dict:
    return {
        "headword": headword,
        "partOfSpeech": "zn",
        "senses": [
            {
                "definition": definition,
                "usageNote": None,
                "usagePattern": None,
                "examples": [f"Dit is {headword}.", f"Ik ken {headword}."],
                "collocations": [],
                "synonyms": [],
                "idioms": [],
            }
        ],
    }


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
    candidates = write_bound_generation_run(
        tmp_path / "generation",
        sample=sample,
        cases=sample["cases"],
        split="holdout",
        articles={
            "lex_bank": {
                **_article("bank", "Een bedrijf waar je geld bewaart of leent."),
                "senses": [
                    {
                        "definition": "Een bedrijf waar je geld bewaart of leent.",
                        "usageNote": None,
                        "usagePattern": None,
                        "examples": [
                            "Mijn salaris komt op mijn rekening.",
                            "De bank leent geld aan bedrijven.",
                        ],
                        "collocations": ["geld lenen"],
                        "synonyms": [],
                        "idioms": [],
                    }
                ],
            }
        },
        prompt_id="secret-prompt-id",
        prompt_hash="secret-prompt-hash",
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
    articles = {}
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
        articles[case_id] = _article(headword, f"definitie {index}")

    sample = {
        "schema": "lexicography-sample-v1",
        "benchmarkId": "interleaved",
        "selectionHash": "selection-hash",
        "cases": cases,
    }
    candidates = write_bound_generation_run(
        tmp_path / "generation",
        sample=sample,
        cases=cases,
        split="validation",
        articles=articles,
        prompt_id="finalist-d",
        prompt_hash="prompt-hash",
    )

    render_blind_review(
        sample=sample,
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
    candidate_dirs = []
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
    for index, split in enumerate(("development", "holdout")):
        case = sample["cases"][index]
        candidate_dirs.append(
            write_bound_generation_run(
                tmp_path / split,
                sample=sample,
                cases=[case],
                split=split,
                articles={case["caseId"]: _article(
                    case["generationInput"]["headword"], f"nieuw {index}"
                )},
                prompt_id="h",
            )
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


def test_blind_review_rejects_candidate_tampering(tmp_path: Path) -> None:
    case = {
        "caseId": "lex_bank",
        "split": "validation",
        "generationInput": {"headword": "bank", "partOfSpeech": "zn"},
    }
    sample = {
        "schema": "lexicography-sample-v1",
        "benchmarkId": "blind-test",
        "selectionHash": "selection-hash",
        "cases": [case],
    }
    candidates = write_bound_generation_run(
        tmp_path / "generation",
        sample=sample,
        cases=[case],
        split="validation",
        articles={"lex_bank": _article("bank", "een financiële instelling")},
        prompt_id="finalist",
    )
    candidate_path = candidates / "lex_bank.json"
    candidate = json.loads(candidate_path.read_text(encoding="utf-8"))
    candidate["content"]["senses"][0]["definition"] = "tampered"
    candidate_path.write_text(json.dumps(candidate), encoding="utf-8")

    with pytest.raises(ValueError, match="immutable request cache"):
        render_blind_review(
            sample=sample,
            protected={
                "schema": "lexicography-protected-references-v1",
                "benchmarkId": "blind-test",
                "cases": [{"caseId": "lex_bank", "references": []}],
            },
            candidate_dir=candidates,
            output_html=tmp_path / "review.html",
            mapping_path=tmp_path / "mapping.json",
            split="validation",
            seed="seed",
            repeat_count=0,
        )
