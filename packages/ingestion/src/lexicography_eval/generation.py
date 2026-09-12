from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any, Protocol

from .artifacts import now_utc as _now, sha256 as _sha256, write_json as _write_json
from .candidate_schema import apply_output_policy, validate_generated_content


CANDIDATE_SCHEMA = "lexicography-candidate-v1"
RUN_MANIFEST_SCHEMA = "lexicography-run-manifest-v1"
GENERATION_INPUT_KEYS = {"headword", "languageCode", "partOfSpeech", "grammar"}
GENERATION_GRAMMAR_KEYS = {
    "gender",
    "plural",
    "diminutive",
    "verb_forms",
    "inflected_form",
    "comparative",
    "superlative",
}


@dataclass(frozen=True)
class PromptSpec:
    prompt_id: str
    system_text: str
    user_instructions: str
    parent_prompt_id: str | None = None
    change_rationale: str | None = None
    force_empty_optional_fields: bool = False

    @property
    def prompt_hash(self) -> str:
        return _sha256(
            {
                "promptId": self.prompt_id,
                "systemText": self.system_text,
                "userInstructions": self.user_instructions,
                "parentPromptId": self.parent_prompt_id,
                "changeRationale": self.change_rationale,
                "forceEmptyOptionalFields": self.force_empty_optional_fields,
            }
        )


@dataclass(frozen=True)
class GenerationBudget:
    max_requests: int
    max_output_tokens: int
    temperature: float = 0.2

    def __post_init__(self) -> None:
        if self.max_requests < 1:
            raise ValueError("max_requests must be positive")
        if self.max_output_tokens < 100:
            raise ValueError("max_output_tokens must be at least 100")
        if not 0 <= self.temperature <= 1:
            raise ValueError("temperature must be between 0 and 1")


@dataclass(frozen=True)
class ChatResult:
    payload: dict[str, Any]
    usage: dict[str, int]
    latency_ms: int
    raw_response_hash: str


class ChatClient(Protocol):
    model: str
    endpoint_fingerprint: str

    def chat_json(
        self,
        *,
        messages: list[dict[str, str]],
        temperature: float,
        max_output_tokens: int,
    ) -> ChatResult: ...


@dataclass(frozen=True)
class GenerationResult:
    generated_count: int
    cache_hit_count: int
    request_count: int
    prompt_tokens: int
    completion_tokens: int


def effective_request_parameters(
    client: ChatClient, *, temperature: float, max_output_tokens: int
) -> dict[str, Any]:
    resolver = getattr(client, "effective_parameters", None)
    if callable(resolver):
        return resolver(
            temperature=temperature, max_output_tokens=max_output_tokens
        )
    return {
        "temperature": temperature,
        "maxOutputTokens": max_output_tokens,
    }


def _messages(
    *,
    prompt: PromptSpec,
    generation_input: dict[str, Any],
) -> list[dict[str, str]]:
    request_payload = {
        "task": "Create an independent Dutch learner-dictionary article.",
        "generationInput": generation_input,
        "editorialInstructions": prompt.user_instructions,
        "outputShape": {
            "headword": "string",
            "partOfSpeech": "string",
            "senses": [
                {
                    "definition": "concise Dutch learner definition",
                    "usageNote": "string or null",
                    "usagePattern": "string or null",
                    "examples": ["one plain and one collocational Dutch example"],
                    "collocations": ["common Dutch collocation"],
                    "synonyms": [
                        {
                            "term": "string",
                            "limitation": "substitution limit or null",
                        }
                    ],
                    "idioms": [
                        {
                            "expression": "established fixed expression",
                            "explanation": "simple original explanation",
                            "examples": ["new Dutch example"],
                        }
                    ],
                }
            ],
        },
        "hardConstraints": [
            "Return only valid JSON.",
            "Use Standard Dutch as used in the Netherlands.",
            "Prefer A2-B1 words and short direct sentences.",
            "Do not mention or imitate any named dictionary or source.",
            "Do not claim an idiom, synonym, register, region, or grammar fact unless confident.",
            "Generate the ordinary current senses you know independently; do not assume a supplied sense count.",
            "Definitions must not be circular and examples must make their sense clear.",
        ],
    }
    return [
        {"role": "system", "content": prompt.system_text.strip()},
        {
            "role": "user",
            "content": json.dumps(request_payload, ensure_ascii=False, sort_keys=True),
        },
    ]


def _clean_room_generation_input(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or not {
        "headword", "partOfSpeech"
    }.issubset(value) or not set(value).issubset(GENERATION_INPUT_KEYS):
        raise ValueError("Every clean-room generationInput must use the closed schema")
    normalized: dict[str, Any] = {}
    for field in ("headword", "languageCode", "partOfSpeech"):
        if field not in value:
            continue
        item = value[field]
        if not isinstance(item, str) or not item.strip() or len(item) > 128:
            raise ValueError("Every clean-room generationInput string must be bounded")
        normalized[field] = item.strip()
    grammar = value.get("grammar")
    if grammar is not None:
        if (
            not isinstance(grammar, dict)
            or not grammar
            or not set(grammar).issubset(GENERATION_GRAMMAR_KEYS)
            or not all(
                isinstance(item, str) and item.strip() and len(item) <= 128
                for item in grammar.values()
            )
        ):
            raise ValueError("Every clean-room generationInput grammar must use the closed schema")
        normalized["grammar"] = {
            key: grammar[key].strip() for key in sorted(grammar)
        }
    return normalized


def _cache_value(
    result: ChatResult,
    generated_at: str,
    *,
    request_hash: str,
    model: str,
    endpoint_fingerprint: str,
) -> dict[str, Any]:
    return {
        "schema": "lexicography-request-cache-v1",
        "requestHash": request_hash,
        "model": model,
        "endpointFingerprint": endpoint_fingerprint,
        "generatedAt": generated_at,
        "payload": result.payload,
        "usage": result.usage,
        "latencyMs": result.latency_ms,
        "rawResponseHash": result.raw_response_hash,
    }


def generate_candidates(
    *,
    sample: dict[str, Any],
    prompt: PromptSpec,
    client: ChatClient,
    run_dir: Path,
    split: str,
    budget: GenerationBudget,
) -> GenerationResult:
    if sample.get("schema") != "lexicography-sample-v1":
        raise ValueError("Sample must use lexicography-sample-v1")
    all_cases = sample.get("cases")
    if not isinstance(all_cases, list):
        raise ValueError("Sample cases must be an array")
    cases = [case for case in all_cases if case.get("split") == split]
    if not cases:
        raise ValueError(f"Sample has no cases in split {split}")

    sample_hash = _sha256(sample)
    existing_manifest_path = run_dir / "run-manifest.json"
    if existing_manifest_path.is_file():
        existing_manifest = json.loads(
            existing_manifest_path.read_text(encoding="utf-8")
        )
        immutable_run = {
            "benchmarkId": sample.get("benchmarkId"),
            "selectionHash": sample.get("selectionHash"),
            "sampleHash": sample_hash,
            "split": split,
            "promptHash": prompt.prompt_hash,
            "model": client.model,
            "endpointFingerprint": client.endpoint_fingerprint,
        }
        existing_run = {
            "benchmarkId": existing_manifest.get("benchmarkId"),
            "selectionHash": existing_manifest.get("selectionHash"),
            "sampleHash": existing_manifest.get("sampleHash"),
            "split": existing_manifest.get("split"),
            "promptHash": (existing_manifest.get("prompt") or {}).get("promptHash"),
            "model": existing_manifest.get("model"),
            "endpointFingerprint": existing_manifest.get("endpointFingerprint"),
        }
        if existing_run != immutable_run:
            raise ValueError("Generation directory is bound to a different immutable run")

    cache_dir = run_dir / "cache"
    invalid_cache_dir = run_dir / "invalid-cache"
    candidate_dir = run_dir / "candidates"
    cache_dir.mkdir(parents=True, exist_ok=True)
    candidate_dir.mkdir(parents=True, exist_ok=True)

    generated = 0
    cache_hits = 0
    request_count = 0
    prompt_tokens = 0
    completion_tokens = 0
    started_at = _now()

    for case in cases:
        case_id = str(case.get("caseId") or "").strip()
        generation_input = case.get("generationInput")
        if not case_id:
            raise ValueError("Every sample case needs caseId and generationInput")
        generation_input = _clean_room_generation_input(generation_input)
        messages = _messages(prompt=prompt, generation_input=generation_input)
        request_parameters = effective_request_parameters(
            client,
            temperature=budget.temperature,
            max_output_tokens=budget.max_output_tokens,
        )
        repair_attempted = False
        while True:
            request_descriptor = {
                "model": client.model,
                "endpointFingerprint": client.endpoint_fingerprint,
                "promptHash": prompt.prompt_hash,
                "messages": messages,
                "parameters": request_parameters,
            }
            request_hash = _sha256(request_descriptor)
            cache_path = cache_dir / f"{request_hash}.json"
            from_cache = cache_path.is_file()
            if from_cache:
                cache_value = json.loads(cache_path.read_text(encoding="utf-8"))
                expected_cache_descriptor = {
                    "schema": "lexicography-request-cache-v1",
                    "requestHash": request_hash,
                    "model": client.model,
                    "endpointFingerprint": client.endpoint_fingerprint,
                }
                actual_cache_descriptor = {
                    key: cache_value.get(key) for key in expected_cache_descriptor
                }
                if actual_cache_descriptor != expected_cache_descriptor:
                    raise ValueError(
                        "Generation cache descriptor does not match the request"
                    )
            else:
                if request_count >= budget.max_requests:
                    raise RuntimeError(
                        f"Generation request budget exhausted after {request_count} requests"
                    )
                result = client.chat_json(
                    messages=messages,
                    temperature=budget.temperature,
                    max_output_tokens=budget.max_output_tokens,
                )
                request_count += 1
                cache_value = _cache_value(
                    result,
                    _now(),
                    request_hash=request_hash,
                    model=client.model,
                    endpoint_fingerprint=client.endpoint_fingerprint,
                )
            try:
                content = apply_output_policy(
                    validate_generated_content(
                        cache_value.get("payload") or {}, generation_input
                    ),
                    force_empty_optional_fields=prompt.force_empty_optional_fields,
                )
            except ValueError:
                invalid_cache_dir.mkdir(parents=True, exist_ok=True)
                invalid_path = invalid_cache_dir / f"{request_hash}.json"
                if from_cache:
                    cache_path.replace(invalid_path)
                else:
                    _write_json(invalid_path, cache_value)
                if repair_attempted:
                    raise
                repair_attempted = True
                messages = messages + [
                    {
                        "role": "system",
                        "content": (
                            "The prior response violated the requested closed JSON schema. "
                            "Return the complete article again. Every example must be a "
                            "non-empty string; use null or [] only where the schema allows it."
                        ),
                    }
                ]
                continue
            if from_cache:
                cache_hits += 1
            else:
                _write_json(cache_path, cache_value)
            break

        usage = cache_value.get("usage") or {}
        prompt_tokens += int(usage.get("prompt_tokens") or 0)
        completion_tokens += int(usage.get("completion_tokens") or 0)
        candidate = {
            "schema": CANDIDATE_SCHEMA,
            "caseId": case_id,
            "benchmarkId": sample.get("benchmarkId"),
            "split": split,
            "promptId": prompt.prompt_id,
            "promptHash": prompt.prompt_hash,
            "model": client.model,
            "requestHash": request_hash,
            "generatedAt": cache_value.get("generatedAt"),
            "content": content,
            "outputPolicyApplied": {
                "forceEmptyOptionalFields": prompt.force_empty_optional_fields
            },
            "providerMetadata": {
                "endpointFingerprint": client.endpoint_fingerprint,
                "latencyMs": cache_value.get("latencyMs"),
                "usage": usage,
                "rawResponseHash": cache_value.get("rawResponseHash"),
            },
        }
        _write_json(candidate_dir / f"{case_id}.json", candidate)
        generated += 1

    manifest = {
        "schema": RUN_MANIFEST_SCHEMA,
        "kind": "generation",
        "benchmarkId": sample.get("benchmarkId"),
        "selectionHash": sample.get("selectionHash"),
        "sampleHash": sample_hash,
        "split": split,
        "prompt": {
            "promptId": prompt.prompt_id,
            "promptHash": prompt.prompt_hash,
            "parentPromptId": prompt.parent_prompt_id,
            "changeRationale": prompt.change_rationale,
            "forceEmptyOptionalFields": prompt.force_empty_optional_fields,
        },
        "model": client.model,
        "endpointFingerprint": client.endpoint_fingerprint,
        "parameters": {
            **effective_request_parameters(
                client,
                temperature=budget.temperature,
                max_output_tokens=budget.max_output_tokens,
            ),
            "maxRequests": budget.max_requests,
        },
        "startedAt": started_at,
        "completedAt": _now(),
        "candidateCount": generated,
        "requestCount": request_count,
        "cacheHitCount": cache_hits,
        "usage": {
            "promptTokens": prompt_tokens,
            "completionTokens": completion_tokens,
        },
    }
    _write_json(run_dir / "run-manifest.json", manifest)
    return GenerationResult(
        generated_count=generated,
        cache_hit_count=cache_hits,
        request_count=request_count,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
    )
