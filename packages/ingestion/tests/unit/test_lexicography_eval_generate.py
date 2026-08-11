from __future__ import annotations

import json
from pathlib import Path
import sys

import pytest


INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))

from lexicography_eval.generation import (  # noqa: E402
    ChatResult,
    GenerationBudget,
    PromptSpec,
    generate_candidates,
    validate_generated_content,
)


class FakeChatClient:
    model = "gpt-4.1"
    endpoint_fingerprint = "azure:unit-test"

    def __init__(self) -> None:
        self.calls: list[dict] = []

    def chat_json(self, **request):
        self.calls.append(request)
        return ChatResult(
            payload={
                "headword": "bank",
                "partOfSpeech": "zn",
                "senses": [
                    {
                        "definition": "Een bedrijf waar mensen geld bewaren of lenen.",
                        "usageNote": None,
                        "usagePattern": None,
                        "examples": [
                            "Ik zet elke maand geld op de bank.",
                            "De bank gaf haar een lening voor het huis.",
                        ],
                        "collocations": ["geld op de bank zetten", "een lening aanvragen"],
                        "synonyms": [],
                        "idioms": [],
                    }
                ],
            },
            usage={"prompt_tokens": 120, "completion_tokens": 80},
            latency_ms=35,
            raw_response_hash="response-hash",
        )


class InvalidOnceChatClient(FakeChatClient):
    def chat_json(self, **request):
        if not self.calls:
            self.calls.append(request)
            return ChatResult(
                payload={
                    "headword": "bank",
                    "partOfSpeech": "zn",
                    "senses": [
                        {
                            "definition": "Een bedrijf voor geldzaken.",
                            "usageNote": None,
                            "usagePattern": None,
                            "examples": [""],
                            "collocations": [],
                            "synonyms": [],
                            "idioms": [],
                        }
                    ],
                },
                usage={"prompt_tokens": 10, "completion_tokens": 10},
                latency_ms=1,
                raw_response_hash="invalid",
            )
        return super().chat_json(**request)


def test_generate_repairs_one_invalid_provider_payload(tmp_path: Path) -> None:
    sample = {
        "schema": "lexicography-sample-v1",
        "benchmarkId": "repair-test",
        "selectionHash": "selection-hash",
        "cases": [
            {
                "caseId": "lex_bank",
                "split": "development",
                "generationInput": {"headword": "bank", "partOfSpeech": "zn"},
            }
        ],
    }
    client = InvalidOnceChatClient()
    run_dir = tmp_path / "run"

    result = generate_candidates(
        sample=sample,
        prompt=PromptSpec("prompt", "system", "instructions"),
        client=client,
        run_dir=run_dir,
        split="development",
        budget=GenerationBudget(max_requests=2, max_output_tokens=800),
    )

    assert result.request_count == 2
    assert len(client.calls) == 2
    assert len(list((run_dir / "invalid-cache").glob("*.json"))) == 1
    assert len(list((run_dir / "candidates").glob("*.json"))) == 1
    assert "prior response violated" in client.calls[1]["messages"][-1]["content"]


def test_generate_uses_only_clean_room_input_and_reuses_request_cache(
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
                    "grammar": {"gender": "de", "plural": "banken"},
                },
                "strata": ["core", "polysemy-contrast"],
                "referenceIds": ["ref_one", "ref_two"],
                "forbiddenProtectedText": "een meubel om op te zitten",
            }
        ],
    }
    prompt = PromptSpec(
        prompt_id="generator-baseline-a",
        system_text="Write an independent Dutch learner dictionary entry.",
        user_instructions="Prefer A2-B1 defining vocabulary.",
    )
    client = FakeChatClient()
    run_dir = tmp_path / "run"

    result = generate_candidates(
        sample=sample,
        prompt=prompt,
        client=client,
        run_dir=run_dir,
        split="development",
        budget=GenerationBudget(max_requests=1, max_output_tokens=800),
    )

    assert result.generated_count == 1
    assert result.cache_hit_count == 0
    assert len(client.calls) == 1
    serialized_request = json.dumps(client.calls[0], ensure_ascii=False)
    assert "bank" in serialized_request
    assert "banken" in serialized_request
    for forbidden in (
        "meubel",
        "referenceIds",
        "ref_one",
        "forbiddenProtectedText",
        "selection-hash",
    ):
        assert forbidden not in serialized_request

    candidate = json.loads(
        next((run_dir / "candidates").glob("*.json")).read_text(encoding="utf-8")
    )
    assert candidate["schema"] == "lexicography-candidate-v1"
    assert candidate["caseId"] == "lex_bank"
    assert candidate["model"] == "gpt-4.1"
    assert candidate["content"]["senses"][0]["definition"].startswith("Een bedrijf")

    manifest = json.loads((run_dir / "run-manifest.json").read_text(encoding="utf-8"))
    assert manifest["schema"] == "lexicography-run-manifest-v1"
    assert manifest["requestCount"] == 1
    assert "apiKey" not in json.dumps(manifest)

    cached = generate_candidates(
        sample=sample,
        prompt=prompt,
        client=client,
        run_dir=run_dir,
        split="development",
        budget=GenerationBudget(max_requests=1, max_output_tokens=800),
    )
    assert cached.generated_count == 1
    assert cached.cache_hit_count == 1
    assert len(client.calls) == 1

    different_prompt = PromptSpec(
        prompt_id="different",
        system_text="Different instructions.",
        user_instructions="Different instructions.",
    )
    with pytest.raises(ValueError, match="bound to a different immutable run"):
        generate_candidates(
            sample=sample,
            prompt=different_prompt,
            client=client,
            run_dir=run_dir,
            split="development",
            budget=GenerationBudget(max_requests=1, max_output_tokens=800),
        )


def test_generate_refuses_corrupt_or_cross_endpoint_cache(tmp_path: Path) -> None:
    sample = {
        "schema": "lexicography-sample-v1",
        "benchmarkId": "cache-test",
        "selectionHash": "selection-hash",
        "cases": [
            {
                "caseId": "lex_bank",
                "split": "development",
                "generationInput": {"headword": "bank", "partOfSpeech": "zn"},
            }
        ],
    }
    prompt = PromptSpec("prompt", "system", "instructions")
    first_client = FakeChatClient()
    run_dir = tmp_path / "run"
    generate_candidates(
        sample=sample,
        prompt=prompt,
        client=first_client,
        run_dir=run_dir,
        split="development",
        budget=GenerationBudget(max_requests=1, max_output_tokens=800),
    )
    cache_path = next((run_dir / "cache").glob("*.json"))
    cache = json.loads(cache_path.read_text())
    cache["endpointFingerprint"] = "openai:wrong"
    cache_path.write_text(json.dumps(cache), encoding="utf-8")

    with pytest.raises(ValueError, match="cache descriptor"):
        generate_candidates(
            sample=sample,
            prompt=prompt,
            client=first_client,
            run_dir=run_dir,
            split="development",
            budget=GenerationBudget(max_requests=1, max_output_tokens=800),
        )


def test_generated_content_rejects_malformed_nested_optional_fields() -> None:
    generation_input = {"headword": "bank", "partOfSpeech": "zn"}
    base = {
        "headword": "bank",
        "partOfSpeech": "zn",
        "senses": [
            {
                "definition": "Een bedrijf voor geldzaken.",
                "usageNote": None,
                "usagePattern": None,
                "examples": ["Ik ga naar de bank.", "De bank leent geld."],
                "collocations": [],
                "synonyms": [{"term": "geldbank", "limitation": None}],
                "idioms": [],
            }
        ],
    }
    assert validate_generated_content(base, generation_input)["senses"][0][
        "synonyms"
    ] == [{"term": "geldbank", "limitation": None}]

    malformed = json.loads(json.dumps(base))
    malformed["senses"][0]["synonyms"] = [{"term": "geldbank"}]
    try:
        validate_generated_content(malformed, generation_input)
    except ValueError as error:
        assert "synonym" in str(error).lower()
    else:
        raise AssertionError("Missing synonym fields must be rejected")

    malformed = json.loads(json.dumps(base))
    malformed["senses"][0]["idioms"] = [
        {"expression": "op de bank", "explanation": "zitten", "examples": "nee"}
    ]
    try:
        validate_generated_content(malformed, generation_input)
    except ValueError as error:
        assert "idiom" in str(error).lower()
    else:
        raise AssertionError("Malformed idiom examples must be rejected")

    malformed = json.loads(json.dumps(base))
    malformed["senses"][0]["unexpected"] = True
    try:
        validate_generated_content(malformed, generation_input)
    except ValueError as error:
        assert "unsupported" in str(error).lower()
    else:
        raise AssertionError("Unsupported sense fields must be rejected")


def test_generated_content_requires_exactly_two_examples_per_sense() -> None:
    generation_input = {"headword": "bank", "partOfSpeech": "zn"}
    base = {
        "headword": "bank",
        "partOfSpeech": "zn",
        "senses": [
            {
                "definition": "Een bedrijf voor geldzaken.",
                "usageNote": None,
                "usagePattern": None,
                "examples": ["Ik ga naar de bank.", "De bank leent geld."],
                "collocations": [],
                "synonyms": [],
                "idioms": [],
            }
        ],
    }
    assert len(validate_generated_content(base, generation_input)["senses"][0]["examples"]) == 2

    for examples in (["Ik ga naar de bank."], ["Eén.", "Twee.", "Drie."]):
        malformed = json.loads(json.dumps(base))
        malformed["senses"][0]["examples"] = examples
        with pytest.raises(ValueError, match="exactly two examples"):
            validate_generated_content(malformed, generation_input)


def test_challenger_d_has_conservative_optional_claim_rules() -> None:
    prompt_path = (
        INGESTION_ROOT
        / "lexicography_eval"
        / "prompts"
        / "generator-challenger-d-conservative-claims.json"
    )
    prompt = json.loads(prompt_path.read_text(encoding="utf-8"))

    assert prompt["parentPromptId"] == "generator-baseline-b-contrastive"
    instructions = prompt["userInstructions"].casefold()
    assert "strict confidence gate" in instructions
    assert "transparent phrase" in instructions
    assert "silently inventory" in instructions
    assert "neighboring sense" in instructions


def test_core_first_output_policy_removes_optional_fields_deterministically() -> None:
    content = {
        "headword": "bank",
        "partOfSpeech": "zn",
        "senses": [
            {
                "definition": "Een bedrijf voor geldzaken.",
                "usageNote": "formeel",
                "usagePattern": "bij de bank",
                "examples": ["Ik ga naar de bank."],
                "collocations": ["naar de bank"],
                "synonyms": [{"term": "geldbank", "limitation": None}],
                "idioms": [],
            }
        ],
    }
    from lexicography_eval.generation import apply_output_policy

    cleaned = apply_output_policy(content, force_empty_optional_fields=True)

    sense = cleaned["senses"][0]
    assert sense["usageNote"] is None
    assert sense["usagePattern"] is None
    assert sense["collocations"] == []
    assert sense["synonyms"] == []
    assert sense["idioms"] == []
