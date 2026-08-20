from __future__ import annotations

import json
import hashlib
from pathlib import Path
import sys

import pytest


INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))

from lexicography_eval.generation import ChatResult  # noqa: E402
from lexicography_eval.judging import JudgeBudget, judge_candidates  # noqa: E402
from lexicography_eval.judgment_schema import (  # noqa: E402
    validate_fidelity,
    validate_quality,
)
from lexicography_eval.similarity import SourceText, SourceTextIndex  # noqa: E402


class FakeJudgeClient:
    model = "gpt-4.1"
    endpoint_fingerprint = "azure:unit-test"

    def __init__(self) -> None:
        self.calls: list[dict] = []

    def chat_json(self, **request):
        self.calls.append(request)
        system = request["messages"][0]["content"]
        if "source-blind" in system:
            payload = {
                "scores": {
                    "naturalness": 4.5,
                    "learnerUsefulness": 4.2,
                    "definitionClarity": 4.4,
                    "exampleQuality": 4.1,
                    "grammarAccuracy": 4.6,
                },
                "hardFailures": [],
                "errorCodes": [],
                "confidence": 0.9,
            }
        else:
            payload = {
                "referenceMatches": [
                    {
                        "referenceId": "ref_one",
                        "matchedSenseIndexes": [0],
                        "fidelity": 4.5,
                    }
                ],
                "scores": {
                    "senseCoverage": 4.2,
                    "senseDiscrimination": 4.3,
                    "independentWording": 4.6,
                },
                "hardFailures": [],
                "errorCodes": ["missing_common_sense"],
                "confidence": 0.8,
            }
        return ChatResult(
            payload=payload,
            usage={"prompt_tokens": 100, "completion_tokens": 40},
            latency_ms=20,
            raw_response_hash="judge-response",
        )


class InventedIdiomJudgeClient(FakeJudgeClient):
    def chat_json(self, **request):
        system = request["messages"][0]["content"]
        if "optional-claims" in system:
            self.calls.append(request)
            return ChatResult(
                payload={
                    "claims": [
                        {
                            "claimId": "senses.0.idioms.0",
                            "verdict": "false",
                            "confidence": 0.98,
                        }
                    ]
                },
                usage={"prompt_tokens": 80, "completion_tokens": 20},
                latency_ms=10,
                raw_response_hash="claims-response",
            )
        return super().chat_json(**request)


class FalseSynonymJudgeClient(FakeJudgeClient):
    def chat_json(self, **request):
        system = request["messages"][0]["content"]
        if "optional-claims" in system:
            self.calls.append(request)
            return ChatResult(
                payload={
                    "claims": [
                        {
                            "claimId": "senses.0.synonyms.0",
                            "verdict": "false",
                            "confidence": 0.95,
                        }
                    ]
                },
                usage={"prompt_tokens": 80, "completion_tokens": 20},
                latency_ms=10,
                raw_response_hash="claims-response",
            )
        return super().chat_json(**request)


class QualityHardFailureClient(FakeJudgeClient):
    def chat_json(self, **request):
        self.calls.append(request)
        return ChatResult(
            payload={
                "scores": {
                    "naturalness": 1,
                    "learnerUsefulness": 1,
                    "definitionClarity": 1,
                    "exampleQuality": 1,
                    "grammarAccuracy": 1,
                },
                "hardFailures": ["invalid_dutch"],
                "errorCodes": ["grammar_error"],
                "confidence": 1,
            },
            usage={"prompt_tokens": 50, "completion_tokens": 20},
            latency_ms=10,
            raw_response_hash="quality-hard-failure",
        )


class InvalidOnceJudgeClient(FakeJudgeClient):
    def chat_json(self, **request):
        if not self.calls:
            self.calls.append(request)
            return ChatResult(
                payload={"unexpected": True},
                usage={"prompt_tokens": 10, "completion_tokens": 5},
                latency_ms=5,
                raw_response_hash="invalid-once",
            )
        return super().chat_json(**request)


class SingleReferenceFidelityClient(FakeJudgeClient):
    def chat_json(self, **request):
        system = request["messages"][0]["content"]
        if "source-aware" not in system:
            return super().chat_json(**request)

        self.calls.append(request)
        user = json.loads(request["messages"][1]["content"])
        references = user["protectedReferences"]
        assert len(references) == 1
        reference_id = references[0]["referenceId"]
        responses = {
            "ref_one": {
                "scores": {
                    "senseCoverage": 4.0,
                    "senseDiscrimination": 3.0,
                    "independentWording": 5.0,
                },
                "hardFailures": [],
                "errorCodes": ["missing_common_sense"],
                "confidence": 0.8,
            },
            "ref_two": {
                "scores": {
                    "senseCoverage": 2.0,
                    "senseDiscrimination": 5.0,
                    "independentWording": 3.0,
                },
                "hardFailures": ["semantic_contradiction"],
                "errorCodes": ["wrong_sense"],
                "confidence": 0.6,
            },
        }
        response = responses[reference_id]
        return ChatResult(
            payload={
                "referenceMatches": [
                    {
                        "referenceId": reference_id,
                        "matchedSenseIndexes": [0],
                        "fidelity": 4.0,
                    }
                ],
                **response,
            },
            usage={"prompt_tokens": 100, "completion_tokens": 40},
            latency_ms=20,
            raw_response_hash=f"judge-{reference_id}",
        )


def _canonical_hash(value: dict) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


@pytest.mark.parametrize(
    ("error_code", "expected_failure"),
    [
        ("wrong_sense", "semantic_contradiction"),
        ("grammar_error", "invalid_dutch"),
        ("morphology_error", "invalid_dutch"),
        ("invented_idiom", "invented_idiom"),
        ("valency_error", "invalid_valency"),
        ("wrong_register", "wrong_register"),
        ("regional_hallucination", "regional_hallucination"),
    ],
)
def test_closed_error_codes_imply_their_non_optional_hard_gate(
    error_code: str, expected_failure: str
) -> None:
    quality = validate_quality(
        {
            "scores": {
                "naturalness": 5,
                "learnerUsefulness": 5,
                "definitionClarity": 5,
                "exampleQuality": 5,
                "grammarAccuracy": 5,
            },
            "hardFailures": [],
            "errorCodes": [error_code],
            "confidence": 1,
        }
    )
    assert quality["hardFailures"] == [expected_failure]

    fidelity = validate_fidelity(
        {
            "referenceMatches": [
                {"referenceId": "ref", "matchedSenseIndexes": [0], "fidelity": 5}
            ],
            "scores": {
                "senseCoverage": 5,
                "senseDiscrimination": 5,
                "independentWording": 5,
            },
            "hardFailures": [],
            "errorCodes": [error_code],
            "confidence": 1,
        },
        ["ref"],
        1,
    )
    assert fidelity["hardFailures"] == [expected_failure]


def _bind_candidate_run(candidate_dir: Path, sample: dict) -> None:
    candidate_path = next(candidate_dir.glob("*.json"))
    candidate = json.loads(candidate_path.read_text())
    candidate.update(
        {
            "benchmarkId": sample["benchmarkId"],
            "split": "development",
            "requestHash": "a" * 64,
            "providerMetadata": {"endpointFingerprint": "azure:unit-test"},
        }
    )
    candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
    cache_dir = candidate_dir.parent / "cache"
    cache_dir.mkdir(exist_ok=True)
    (cache_dir / f"{candidate['requestHash']}.json").write_text(
        json.dumps(
            {
                "schema": "lexicography-request-cache-v1",
                "requestHash": candidate["requestHash"],
                "model": "gpt-4.1",
                "endpointFingerprint": "azure:unit-test",
                "payload": candidate["content"],
            }
        ),
        encoding="utf-8",
    )
    (candidate_dir.parent / "run-manifest.json").write_text(
        json.dumps(
            {
                "schema": "lexicography-run-manifest-v1",
                "kind": "generation",
                "benchmarkId": sample["benchmarkId"],
                "selectionHash": sample["selectionHash"],
                "sampleHash": _canonical_hash(sample),
                "split": "development",
                "prompt": {
                    "promptId": candidate["promptId"],
                    "promptHash": candidate["promptHash"],
                },
                "model": "gpt-4.1",
                "endpointFingerprint": "azure:unit-test",
            }
        ),
        encoding="utf-8",
    )


def test_judges_keep_quality_source_blind_and_emit_quote_free_aggregate(
    tmp_path: Path,
) -> None:
    sample = {
        "schema": "lexicography-sample-v1",
        "benchmarkId": "test-benchmark",
        "selectionHash": "selection-hash",
        "cases": [
            {
                "caseId": "lex_bank",
                "split": "development",
                "generationInput": {
                    "headword": "bank",
                    "languageCode": "nl",
                    "partOfSpeech": "zn",
                },
                "referenceIds": ["ref_one"],
                "strata": ["core"],
            }
        ],
    }
    protected = {
        "schema": "lexicography-protected-references-v1",
        "benchmarkId": "test-benchmark",
        "selectionHash": "selection-hash",
        "cases": [
            {
                "caseId": "lex_bank",
                "split": "development",
                "headword": "bank",
                "partOfSpeech": "zn",
                "references": [
                    {
                        "meaningId": 1,
                        "definition": "een bedrijf dat geld bewaart",
                        "context": "",
                        "examples": ["Zij werkt bij een bank."],
                        "idioms": [],
                        "synonyms": [],
                        "usageLabels": [],
                        "sourceHash": "one",
                    }
                ],
            }
        ],
    }
    candidate_dir = tmp_path / "candidates"
    candidate_dir.mkdir()
    (candidate_dir / "lex_bank.json").write_text(
        json.dumps(
            {
                "schema": "lexicography-candidate-v1",
                "caseId": "lex_bank",
                "promptId": "baseline-a",
                "promptHash": "prompt-hash",
                "model": "gpt-4.1",
                "content": {
                    "headword": "bank",
                    "partOfSpeech": "zn",
                    "senses": [
                        {
                            "definition": "Een bedrijf waar je geld kunt bewaren of lenen.",
                            "usageNote": None,
                            "usagePattern": None,
                            "examples": [
                                "Ik zet geld op mijn rekening.",
                                "De bank leent geld aan bedrijven.",
                            ],
                            "collocations": [],
                            "synonyms": [],
                            "idioms": [],
                        }
                    ],
                },
            }
        ),
        encoding="utf-8",
    )
    _bind_candidate_run(candidate_dir, sample)
    source_index = SourceTextIndex(
        [
            SourceText(
                source_hash="source-one",
                field="definition",
                text="een bedrijf dat geld bewaart",
            ),
            SourceText(
                source_hash="source-one",
                field="example",
                text="Zij werkt bij een bank.",
            ),
        ]
    )
    client = FakeJudgeClient()

    result = judge_candidates(
        sample=sample,
        protected=protected,
        candidate_dir=candidate_dir,
        source_index=source_index,
        client=client,
        output_dir=tmp_path / "judgments",
        split="development",
        budget=JudgeBudget(max_requests=2, max_output_tokens=500),
    )

    assert result.judged_count == 1
    assert len(client.calls) == 2
    quality_request = json.dumps(client.calls[0], ensure_ascii=False)
    fidelity_request = json.dumps(client.calls[1], ensure_ascii=False)
    assert "een bedrijf dat geld bewaart" not in quality_request
    assert "Zij werkt bij een bank" not in quality_request
    assert "een bedrijf dat geld bewaart" in fidelity_request

    judgment = json.loads(
        (tmp_path / "judgments" / "items" / "lex_bank.json").read_text(
            encoding="utf-8"
        )
    )
    assert judgment["schema"] == "lexicography-judgment-v1"
    assert judgment["hardPass"] is True
    assert judgment["errorCodes"] == ["missing_common_sense"]

    aggregate = json.loads(
        (tmp_path / "judgments" / "aggregate.json").read_text(encoding="utf-8")
    )
    assert aggregate["errorCounts"] == {"missing_common_sense": 1}
    serialized_aggregate = json.dumps(aggregate, ensure_ascii=False)
    assert "een bedrijf dat geld bewaart" not in serialized_aggregate
    assert "Zij werkt bij een bank" not in serialized_aggregate


def test_judge_rejects_protected_bundle_from_another_selection(tmp_path: Path) -> None:
    sample, protected, candidate_dir, source_index = _fixture(tmp_path)
    protected["selectionHash"] = "another-selection"
    with pytest.raises(ValueError, match="selectionHash"):
        judge_candidates(
            sample=sample, protected=protected, candidate_dir=candidate_dir,
            source_index=source_index, client=FakeJudgeClient(),
            output_dir=tmp_path / "judgments", split="development",
            budget=JudgeBudget(max_requests=2, max_output_tokens=500),
        )


def test_source_aware_judging_isolates_references_and_aggregates_results(
    tmp_path: Path,
) -> None:
    sample, protected, candidate_dir, source_index = _fixture(tmp_path)
    sample["cases"][0]["referenceIds"] = ["ref_one", "ref_two"]
    protected["cases"][0]["references"].append(
        {
            "definition": "een meubel om op te zitten",
            "context": "",
            "examples": ["We zitten samen op de bank."],
            "idioms": [],
            "synonyms": [],
            "usageLabels": [],
            "sourceHash": "two",
        }
    )
    _bind_candidate_run(candidate_dir, sample)
    client = SingleReferenceFidelityClient()

    result = judge_candidates(
        sample=sample,
        protected=protected,
        candidate_dir=candidate_dir,
        source_index=source_index,
        client=client,
        output_dir=tmp_path / "isolated-reference-judgments",
        split="development",
        budget=JudgeBudget(max_requests=3, max_output_tokens=500),
    )

    assert result.request_count == 3
    fidelity_calls = [
        call
        for call in client.calls
        if "source-aware" in call["messages"][0]["content"]
    ]
    assert len(fidelity_calls) == 2
    judgment = json.loads(
        (
            tmp_path
            / "isolated-reference-judgments"
            / "items"
            / "lex_bank.json"
        ).read_text()
    )
    assert [
        match["referenceId"] for match in judgment["fidelity"]["referenceMatches"]
    ] == ["ref_one", "ref_two"]
    assert judgment["fidelity"]["scores"] == {
        "senseCoverage": 3.0,
        "senseDiscrimination": 4.0,
        "independentWording": 4.0,
    }
    assert judgment["fidelity"]["errorCodes"] == [
        "missing_common_sense",
        "wrong_sense",
    ]
    assert judgment["fidelity"]["hardFailures"] == ["semantic_contradiction"]
    assert judgment["fidelity"]["confidence"] == 0.7


def test_optional_claim_audit_hard_fails_an_invented_idiom(tmp_path: Path) -> None:
    sample, protected, candidate_dir, source_index = _fixture(tmp_path)
    candidate_path = candidate_dir / "lex_bank.json"
    candidate = json.loads(candidate_path.read_text(encoding="utf-8"))
    candidate["content"]["senses"][0]["idioms"] = [
        {
            "expression": "de bank breken",
            "explanation": "heel rijk worden",
            "examples": ["Met dit idee breekt hij de bank."],
        }
    ]
    candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
    _bind_candidate_run(candidate_dir, sample)
    client = InventedIdiomJudgeClient()

    result = judge_candidates(
        sample=sample,
        protected=protected,
        candidate_dir=candidate_dir,
        source_index=source_index,
        client=client,
        output_dir=tmp_path / "claims-judgments",
        split="development",
        budget=JudgeBudget(max_requests=3, max_output_tokens=500),
    )

    assert result.request_count == 2
    judgment = json.loads(
        (tmp_path / "claims-judgments" / "items" / "lex_bank.json").read_text()
    )
    assert judgment["hardPass"] is False
    assert judgment["hardFailures"] == ["invented_idiom"]
    assert "invented_idiom" in judgment["errorCodes"]
    assert judgment["claimsAudit"]["claims"][0]["verdict"] == "false"


def test_similarity_hard_failure_skips_all_paid_judges(tmp_path: Path) -> None:
    sample, protected, candidate_dir, source_index = _fixture(tmp_path)
    candidate_path = candidate_dir / "lex_bank.json"
    candidate = json.loads(candidate_path.read_text(encoding="utf-8"))
    candidate["content"]["senses"][0]["examples"] = [
        "Zij werkt bij een bank.",
        "De bank leent geld aan bedrijven.",
    ]
    candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
    _bind_candidate_run(candidate_dir, sample)
    client = FakeJudgeClient()

    result = judge_candidates(
        sample=sample,
        protected=protected,
        candidate_dir=candidate_dir,
        source_index=source_index,
        client=client,
        output_dir=tmp_path / "hard-gate-judgments",
        split="development",
        budget=JudgeBudget(max_requests=2, max_output_tokens=500),
    )

    assert result.request_count == 0
    assert client.calls == []
    judgment = json.loads(
        (tmp_path / "hard-gate-judgments" / "items" / "lex_bank.json").read_text()
    )
    assert judgment["hardFailures"] == ["source_reproduction"]


def test_quality_hard_failure_skips_claims_and_source_aware_judge(tmp_path: Path) -> None:
    sample, protected, candidate_dir, source_index = _fixture(tmp_path)
    client = QualityHardFailureClient()

    result = judge_candidates(
        sample=sample,
        protected=protected,
        candidate_dir=candidate_dir,
        source_index=source_index,
        client=client,
        output_dir=tmp_path / "quality-hard-gate",
        split="development",
        budget=JudgeBudget(max_requests=3, max_output_tokens=500),
    )

    assert result.request_count == 1
    assert len(client.calls) == 1
    judgment = json.loads(
        (tmp_path / "quality-hard-gate" / "items" / "lex_bank.json").read_text()
    )
    assert judgment["hardPass"] is False
    assert judgment["fidelity"]["scores"]["senseCoverage"] == 0


def test_judge_repairs_one_invalid_closed_schema_response(tmp_path: Path) -> None:
    sample, protected, candidate_dir, source_index = _fixture(tmp_path)
    client = InvalidOnceJudgeClient()

    result = judge_candidates(
        sample=sample,
        protected=protected,
        candidate_dir=candidate_dir,
        source_index=source_index,
        client=client,
        output_dir=tmp_path / "schema-repair",
        split="development",
        budget=JudgeBudget(max_requests=3, max_output_tokens=500),
    )

    assert result.request_count == 3
    assert len(client.calls) == 3
    caches = [json.loads(path.read_text()) for path in (tmp_path / "schema-repair" / "cache").glob("*.json")]
    assert any(cache.get("schemaRepairAttempted") is True for cache in caches)


def test_false_synonym_claim_is_a_promotion_hard_failure(tmp_path: Path) -> None:
    sample, protected, candidate_dir, source_index = _fixture(tmp_path)
    candidate_path = candidate_dir / "lex_bank.json"
    candidate = json.loads(candidate_path.read_text(encoding="utf-8"))
    candidate["content"]["senses"][0]["synonyms"] = [
        {"term": "geldkantoor", "limitation": None}
    ]
    candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
    _bind_candidate_run(candidate_dir, sample)
    client = FalseSynonymJudgeClient()

    judge_candidates(
        sample=sample,
        protected=protected,
        candidate_dir=candidate_dir,
        source_index=source_index,
        client=client,
        output_dir=tmp_path / "synonym-judgments",
        split="development",
        budget=JudgeBudget(max_requests=3, max_output_tokens=500),
    )

    judgment = json.loads(
        (tmp_path / "synonym-judgments" / "items" / "lex_bank.json").read_text()
    )
    assert judgment["hardPass"] is False
    assert judgment["hardFailures"] == ["unsupported_optional_claim"]
    assert "synonym_overclaim" in judgment["errorCodes"]


def test_invalid_nested_candidate_schema_fails_before_paid_judges(
    tmp_path: Path,
) -> None:
    sample, protected, candidate_dir, source_index = _fixture(tmp_path)
    candidate_path = candidate_dir / "lex_bank.json"
    candidate = json.loads(candidate_path.read_text(encoding="utf-8"))
    candidate["content"]["senses"][0]["synonyms"] = [{"term": "geldbank"}]
    candidate_path.write_text(json.dumps(candidate), encoding="utf-8")
    _bind_candidate_run(candidate_dir, sample)
    client = FakeJudgeClient()

    try:
        judge_candidates(
            sample=sample,
            protected=protected,
            candidate_dir=candidate_dir,
            source_index=source_index,
            client=client,
            output_dir=tmp_path / "invalid-schema-judgments",
            split="development",
            budget=JudgeBudget(max_requests=2, max_output_tokens=500),
        )
    except ValueError as error:
        assert "synonym" in str(error).lower()
    else:
        raise AssertionError("Malformed candidate must be rejected")
    assert client.calls == []


def _fixture(tmp_path: Path):
    sample = {
        "schema": "lexicography-sample-v1",
        "benchmarkId": "test-benchmark",
        "selectionHash": "selection-hash",
        "cases": [
            {
                "caseId": "lex_bank",
                "split": "development",
                "generationInput": {
                    "headword": "bank",
                    "languageCode": "nl",
                    "partOfSpeech": "zn",
                },
                "referenceIds": ["ref_one"],
                "strata": ["core"],
            }
        ],
    }
    protected = {
        "schema": "lexicography-protected-references-v1",
        "benchmarkId": "test-benchmark",
        "selectionHash": "selection-hash",
        "cases": [
            {
                "caseId": "lex_bank",
                "split": "development",
                "headword": "bank",
                "partOfSpeech": "zn",
                "references": [
                    {
                        "definition": "een bedrijf dat geld bewaart",
                        "context": "",
                        "examples": ["Zij werkt bij een bank."],
                        "idioms": [],
                        "synonyms": [],
                        "usageLabels": [],
                        "sourceHash": "one",
                    }
                ],
            }
        ],
    }
    candidate_dir = tmp_path / "fixture-candidates"
    candidate_dir.mkdir()
    (candidate_dir / "lex_bank.json").write_text(
        json.dumps(
            {
                "schema": "lexicography-candidate-v1",
                "caseId": "lex_bank",
                "promptId": "baseline-a",
                "promptHash": "prompt-hash",
                "model": "gpt-4.1",
                "content": {
                    "headword": "bank",
                    "partOfSpeech": "zn",
                    "senses": [
                        {
                            "definition": "Een bedrijf waar je geld kunt bewaren of lenen.",
                            "usageNote": None,
                            "usagePattern": None,
                            "examples": [
                                "Ik zet geld op mijn rekening.",
                                "De bank leent geld aan bedrijven.",
                            ],
                            "collocations": [],
                            "synonyms": [],
                            "idioms": [],
                        }
                    ],
                },
            }
        ),
        encoding="utf-8",
    )
    _bind_candidate_run(candidate_dir, sample)
    source_index = SourceTextIndex(
        [
            SourceText("source-one", "definition", "een bedrijf dat geld bewaart"),
            SourceText("source-one", "example", "Zij werkt bij een bank."),
        ]
    )
    return sample, protected, candidate_dir, source_index
