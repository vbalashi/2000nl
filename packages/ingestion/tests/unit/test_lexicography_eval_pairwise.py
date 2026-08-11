from __future__ import annotations

import json
from pathlib import Path
import sys

import pytest


INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))

from lexicography_eval.generation import ChatResult  # noqa: E402
from lexicography_eval.pairwise import (  # noqa: E402
    PairwiseBudget,
    judge_pairwise_candidates,
)


class FakePairwiseClient:
    model = "gpt-4.1"
    endpoint_fingerprint = "azure:unit-test"

    def __init__(self) -> None:
        self.calls: list[dict] = []

    def chat_json(self, **request):
        self.calls.append(request)
        return ChatResult(
            payload={
                "claims": [
                    {
                        "claimId": "pairwise-verdict",
                        "verdict": "A",
                    }
                ]
            },
            usage={"prompt_tokens": 50, "completion_tokens": 10},
            latency_ms=5,
            raw_response_hash=f"pairwise-{len(self.calls)}",
        )


class InvalidOncePairwiseClient(FakePairwiseClient):
    def chat_json(self, **request):
        self.calls.append(request)
        payload = (
            {"claims": [{"claimId": "pairwise-verdict", "verdict": "invalid"}]}
            if len(self.calls) == 1
            else {
                "claims": [
                    {
                        "claimId": "pairwise-verdict",
                        "verdict": "tie_good",
                    }
                ]
            }
        )
        return ChatResult(
            payload=payload,
            usage={"prompt_tokens": 50, "completion_tokens": 10},
            latency_ms=5,
            raw_response_hash=f"pairwise-{len(self.calls)}",
        )


def _article(headword: str, *, variant: str = "") -> dict:
    return {
        "headword": headword,
        "partOfSpeech": "zn",
        "senses": [
            {
                "definition": f"een {variant}eenvoudige betekenis van {headword}",
                "usageNote": None,
                "usagePattern": None,
                "examples": [
                    f"Dit is {headword}.",
                    f"Ik ken {headword}.",
                ],
                "collocations": [],
                "synonyms": [],
                "idioms": [],
            }
        ],
    }


def _write_candidate(
    directory: Path, case_id: str, headword: str, *, variant: str = ""
) -> None:
    side = "two" if variant else "one"
    (directory / f"{case_id}.json").write_text(
        json.dumps(
            {
                "schema": "lexicography-candidate-v1",
                "caseId": case_id,
                "promptId": f"prompt-{side}",
                "promptHash": f"prompt-hash-{side}",
                "model": "gpt-4.1",
                "requestHash": ("b" if variant else "a") * 64,
                "content": _article(headword, variant=variant),
            }
        ),
        encoding="utf-8",
    )


def test_pairwise_judge_blinds_content_aggregates_only_and_adds_swapped_duplicate(
    tmp_path: Path,
) -> None:
    sample = {
        "schema": "lexicography-sample-v1",
        "benchmarkId": "test-benchmark",
        "selectionHash": "selection-hash",
        "protectedSecret": "must-not-reach-the-judge",
        "cases": [
            {
                "caseId": "lex_alpha",
                "split": "development",
                "generationInput": {
                    "headword": "alpha",
                    "languageCode": "nl",
                    "partOfSpeech": "zn",
                },
            },
            {
                "caseId": "lex_beta",
                "split": "development",
                "generationInput": {
                    "headword": "beta",
                    "languageCode": "nl",
                    "partOfSpeech": "zn",
                },
            },
        ],
    }
    candidate_one = tmp_path / "candidate-one"
    candidate_two = tmp_path / "candidate-two"
    candidate_one.mkdir()
    candidate_two.mkdir()
    for case_id, headword in (("lex_alpha", "alpha"), ("lex_beta", "beta")):
        _write_candidate(candidate_one, case_id, headword)
        _write_candidate(candidate_two, case_id, headword, variant="andere ")
    client = FakePairwiseClient()
    output_path = tmp_path / "pairwise.json"

    result = judge_pairwise_candidates(
        sample=sample,
        candidate_one_dir=candidate_one,
        candidate_two_dir=candidate_two,
        client=client,
        output_path=output_path,
        budget=PairwiseBudget(
            max_requests=3,
            max_output_tokens=300,
            swapped_duplicate_count=1,
        ),
        randomization_seed="review-seed",
    )

    assert result.case_count == 2
    assert result.request_count == 3
    assert len(client.calls) == 3
    assert all(
        "must-not-reach-the-judge" not in json.dumps(call, ensure_ascii=False)
        for call in client.calls
    )
    assert all("protectedSecret" not in json.dumps(call) for call in client.calls)

    artifact = json.loads(output_path.read_text(encoding="utf-8"))
    assert artifact["benchmarkId"] == "test-benchmark"
    assert artifact["selectionHash"] == "selection-hash"
    assert artifact["split"] == "development"
    assert len(artifact["caseSetHash"]) == 64
    assert set(artifact["orderedRunBindings"]) == {"candidateOne", "candidateTwo"}
    assert all(
        len(value) == 64 for value in artifact["orderedRunBindings"].values()
    )
    assert {key: artifact[key] for key in artifact if key not in {
        "benchmarkId", "selectionHash", "split", "caseSetHash", "orderedRunBindings"
    }} == {
        "caseCount": 2,
        "primaryVerdicts": {
            "both_bad": 0,
            "candidateOne": 0,
            "candidateTwo": 2,
            "tie_good": 0,
        },
        "rates": {
            "bothBadRate": 0.0,
            "candidateOneWinRate": 0.0,
            "candidateTwoWinRate": 1.0,
            "tieGoodRate": 0.0,
        },
        "requestBudget": {
            "cacheHitCount": 0,
            "maxRequests": 3,
            "requestCount": 3,
        },
        "schema": "lexicography-pairwise-aggregate-v1",
        "swappedOrderChecks": {
            "duplicateCount": 1,
            "mappedVerdictAgreementRate": 0.0,
            "sameOpaqueWinnerRate": 1.0,
        },
    }
    rendered = output_path.read_text(encoding="utf-8")
    assert "lex_alpha" not in rendered
    assert "lex_beta" not in rendered
    assert "alpha" not in rendered
    assert "beta" not in rendered


def test_pairwise_judge_requires_budget_for_primary_and_duplicate_calls(
    tmp_path: Path,
) -> None:
    sample = {
        "schema": "lexicography-sample-v1",
        "benchmarkId": "test-benchmark",
        "selectionHash": "selection-hash",
        "cases": [
            {
                "caseId": "lex_alpha",
                "split": "development",
                "generationInput": {
                    "headword": "alpha",
                    "languageCode": "nl",
                    "partOfSpeech": "zn",
                },
            }
        ],
    }
    candidate_one = tmp_path / "candidate-one"
    candidate_two = tmp_path / "candidate-two"
    candidate_one.mkdir()
    candidate_two.mkdir()
    _write_candidate(candidate_one, "lex_alpha", "alpha")
    _write_candidate(candidate_two, "lex_alpha", "alpha")

    with pytest.raises(ValueError, match="budget"):
        judge_pairwise_candidates(
            sample=sample,
            candidate_one_dir=candidate_one,
            candidate_two_dir=candidate_two,
            client=FakePairwiseClient(),
            output_path=tmp_path / "pairwise.json",
            budget=PairwiseBudget(
                max_requests=1,
                max_output_tokens=300,
                swapped_duplicate_count=1,
            ),
            randomization_seed="review-seed",
        )


def test_pairwise_judge_repairs_an_invalid_closed_verdict_through_cached_call(
    tmp_path: Path,
) -> None:
    sample = {
        "schema": "lexicography-sample-v1",
        "benchmarkId": "test-benchmark",
        "selectionHash": "selection-hash",
        "cases": [
            {
                "caseId": "lex_alpha",
                "split": "development",
                "generationInput": {
                    "headword": "alpha",
                    "languageCode": "nl",
                    "partOfSpeech": "zn",
                },
            }
        ],
    }
    candidate_one = tmp_path / "candidate-one"
    candidate_two = tmp_path / "candidate-two"
    candidate_one.mkdir()
    candidate_two.mkdir()
    _write_candidate(candidate_one, "lex_alpha", "alpha")
    _write_candidate(candidate_two, "lex_alpha", "alpha", variant="andere ")
    client = InvalidOncePairwiseClient()

    result = judge_pairwise_candidates(
        sample=sample,
        candidate_one_dir=candidate_one,
        candidate_two_dir=candidate_two,
        client=client,
        output_path=tmp_path / "pairwise.json",
        budget=PairwiseBudget(
            max_requests=2,
            max_output_tokens=300,
            swapped_duplicate_count=0,
        ),
        randomization_seed="review-seed",
    )

    assert result.request_count == 2
    assert len(client.calls) == 2
    assert "closed schema" in client.calls[1]["messages"][-1]["content"]
    artifact = json.loads((tmp_path / "pairwise.json").read_text(encoding="utf-8"))
    assert artifact["primaryVerdicts"]["tie_good"] == 1
