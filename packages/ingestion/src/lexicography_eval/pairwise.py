from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import json
from pathlib import Path
import random
from typing import Any

from .artifacts import sha256, write_json
from .candidate_schema import validate_generated_content
from .generation import ChatClient
from .judge_requests import cached_judge_call
from .judgment_provenance import load_bound_candidates


PAIRWISE_SCHEMA = "lexicography-pairwise-aggregate-v1"
PAIRWISE_CLAIM_ID = "pairwise-verdict"
PAIRWISE_VERDICTS = {"A", "B", "tie_good", "both_bad"}


@dataclass(frozen=True)
class PairwiseBudget:
    max_requests: int
    max_output_tokens: int
    swapped_duplicate_count: int
    temperature: float = 0.0

    def __post_init__(self) -> None:
        if self.max_requests < 1:
            raise ValueError("Pairwise request budget must be positive")
        if self.max_output_tokens < 100:
            raise ValueError("Pairwise max_output_tokens must be at least 100")
        if self.swapped_duplicate_count < 0:
            raise ValueError("Pairwise swapped_duplicate_count cannot be negative")
        if not 0 <= self.temperature <= 1:
            raise ValueError("Pairwise temperature must be between 0 and 1")


@dataclass(frozen=True)
class PairwiseResult:
    case_count: int
    request_count: int
    cache_hit_count: int
    candidate_one_wins: int
    candidate_two_wins: int
    tie_good_count: int
    both_bad_count: int
    duplicate_count: int
    mapped_verdict_agreement_rate: float
    same_opaque_winner_rate: float


def _validate_pairwise_payload(payload: dict[str, Any]) -> str:
    if not isinstance(payload, dict) or set(payload) != {"claims"}:
        raise ValueError("Pairwise judge must return the closed claims envelope")
    claims = payload.get("claims")
    if not isinstance(claims, list) or len(claims) != 1:
        raise ValueError("Pairwise judge must return exactly one verdict")
    claim = claims[0]
    if not isinstance(claim, dict) or set(claim) != {"claimId", "verdict"}:
        raise ValueError("Pairwise verdict must use the closed claim schema")
    if claim.get("claimId") != PAIRWISE_CLAIM_ID:
        raise ValueError("Pairwise judge returned an unknown verdict claim")
    verdict = claim.get("verdict")
    if verdict not in PAIRWISE_VERDICTS:
        raise ValueError("Pairwise judge returned an unsupported verdict")
    return str(verdict)


def _sample_cases(sample: dict[str, Any]) -> dict[str, dict[str, Any]]:
    if sample.get("schema") != "lexicography-sample-v1":
        raise ValueError("Pairwise sample must use the public sample schema")
    raw_cases = sample.get("cases")
    if not isinstance(raw_cases, list) or not raw_cases:
        raise ValueError("Pairwise sample must contain cases")
    result: dict[str, dict[str, Any]] = {}
    for case in raw_cases:
        if not isinstance(case, dict):
            raise ValueError("Pairwise sample cases must be objects")
        case_id = case.get("caseId")
        generation_input = case.get("generationInput")
        if (
            not isinstance(case_id, str)
            or not case_id
            or case_id in result
            or not isinstance(generation_input, dict)
        ):
            raise ValueError("Pairwise sample cases require unique IDs and generation input")
        result[case_id] = generation_input
    return result


def _load_candidates(
    *,
    candidate_dir: Path,
    generation_inputs: dict[str, dict[str, Any]],
    sample: dict[str, Any],
    split: str,
) -> tuple[dict[str, dict[str, Any]], str]:
    if not candidate_dir.is_dir():
        raise ValueError("Pairwise candidate directory is missing")
    candidates: dict[str, dict[str, Any]] = {}
    binding_records = []
    cases = list(sample.get("cases") or [])
    bound, _ = load_bound_candidates(
        sample=sample, candidate_dir=candidate_dir, cases=cases, split=split
    )
    for case_id, raw in sorted(bound.items()):
        content = validate_generated_content(
            raw.get("content") or {}, generation_inputs[case_id]
        )
        candidates[case_id] = content
        binding_records.append(
            {
                "caseId": case_id,
                "promptId": raw.get("promptId"),
                "promptHash": raw.get("promptHash"),
                "model": raw.get("model"),
                "generationRequestHash": raw.get("requestHash"),
            }
        )
    binding = sha256(
        {
            "benchmarkId": sample.get("benchmarkId"),
            "selectionHash": sample.get("selectionHash"),
            "candidates": sorted(binding_records, key=lambda value: value["caseId"]),
        }
    )
    return candidates, binding


def _flip_for_case(*, case_id: str, seed: str) -> bool:
    return int(sha256({"caseId": case_id, "seed": seed})[:2], 16) % 2 == 0


def _messages(*, article_a: dict[str, Any], article_b: dict[str, Any]) -> list[dict[str, str]]:
    request = {
        "task": "Compare two independently generated Dutch learner-dictionary articles.",
        "rules": [
            "This is source-blind. Use no source dictionary, reference, or quotation.",
            "Judge semantic and referent correctness, ordinary sense admission and coverage, definition-example entailment, Standard Dutch naturalness, and A2-B1 clarity.",
            "Labels A and B are opaque display labels, not model, prompt, or source identities.",
            "Choose tie_good only when neither article is meaningfully better and both are acceptable; choose both_bad only when neither is acceptable.",
        ],
        "articles": {"A": article_a, "B": article_b},
        "outputShape": {
            "claims": [
                {
                    "claimId": PAIRWISE_CLAIM_ID,
                    "verdict": "A | B | tie_good | both_bad",
                }
            ]
        },
    }
    return [
        {
            "role": "system",
            "content": (
                "You are a source-blind Dutch learner-lexicography pairwise judge. "
                "Use the optional-claims envelope only to return the one closed verdict. "
                "Return only JSON and no prose."
            ),
        },
        {"role": "user", "content": json.dumps(request, ensure_ascii=False, sort_keys=True)},
    ]


def _map_verdict(verdict: str, *, candidate_one_is_a: bool) -> str:
    if verdict == "A":
        return "candidateOne" if candidate_one_is_a else "candidateTwo"
    if verdict == "B":
        return "candidateTwo" if candidate_one_is_a else "candidateOne"
    return verdict


def _duplicate_case_ids(case_ids: list[str], *, count: int, seed: str) -> list[str]:
    if count > len(case_ids):
        raise ValueError("Pairwise swapped_duplicate_count exceeds case count")
    chooser = random.Random(int(sha256({"seed": seed, "purpose": "swaps"})[:16], 16))
    result = list(case_ids)
    chooser.shuffle(result)
    return sorted(result[:count])


def _rate(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 4) if denominator else 0.0


def judge_pairwise_candidates(
    *,
    sample: dict[str, Any],
    candidate_one_dir: Path,
    candidate_two_dir: Path,
    client: ChatClient,
    output_path: Path,
    budget: PairwiseBudget,
    randomization_seed: str,
) -> PairwiseResult:
    if not randomization_seed:
        raise ValueError("Pairwise randomization_seed is required")
    benchmark_id = sample.get("benchmarkId")
    selection_hash = sample.get("selectionHash")
    if not isinstance(benchmark_id, str) or not benchmark_id:
        raise ValueError("Pairwise sample benchmarkId is required")
    if not isinstance(selection_hash, str) or not selection_hash:
        raise ValueError("Pairwise sample selectionHash is required")
    generation_inputs = _sample_cases(sample)
    splits = {
        case.get("split")
        for case in sample.get("cases") or []
        if isinstance(case, dict)
    }
    if len(splits) != 1 or next(iter(splits)) not in {"development", "validation"}:
        raise ValueError("Pairwise sample must contain exactly one split")
    split = str(next(iter(splits)))
    case_set_hash = sha256(sorted(generation_inputs))
    candidate_one, candidate_one_binding = _load_candidates(
        candidate_dir=candidate_one_dir,
        generation_inputs=generation_inputs,
        sample=sample,
        split=split,
    )
    candidate_two, candidate_two_binding = _load_candidates(
        candidate_dir=candidate_two_dir,
        generation_inputs=generation_inputs,
        sample=sample,
        split=split,
    )
    case_ids = sorted(generation_inputs)
    duplicate_case_ids = _duplicate_case_ids(
        case_ids, count=budget.swapped_duplicate_count, seed=randomization_seed
    )
    planned_calls = len(case_ids) + len(duplicate_case_ids)
    if budget.max_requests < planned_calls:
        raise ValueError("Pairwise request budget cannot cover primary and duplicate calls")

    counters = {"requests": 0, "cache_hits": 0}
    cache_dir = output_path.parent / "cache"
    primary: dict[str, tuple[str, str, bool]] = {}
    for case_id in case_ids:
        candidate_one_is_a = _flip_for_case(
            case_id=case_id, seed=randomization_seed
        )
        article_a, article_b = (
            (candidate_one[case_id], candidate_two[case_id])
            if candidate_one_is_a
            else (candidate_two[case_id], candidate_one[case_id])
        )
        payload = cached_judge_call(
            client=client,
            messages=_messages(article_a=article_a, article_b=article_b),
            cache_dir=cache_dir,
            budget=budget,
            counters=counters,
            payload_validator=_validate_pairwise_payload,
        )
        verdict = _validate_pairwise_payload(payload)
        primary[case_id] = (
            verdict,
            _map_verdict(verdict, candidate_one_is_a=candidate_one_is_a),
            candidate_one_is_a,
        )

    mapped_agreements = 0
    same_opaque_winners = 0
    for case_id in duplicate_case_ids:
        primary_verdict, primary_mapped, candidate_one_is_a = primary[case_id]
        article_a, article_b = (
            (candidate_two[case_id], candidate_one[case_id])
            if candidate_one_is_a
            else (candidate_one[case_id], candidate_two[case_id])
        )
        payload = cached_judge_call(
            client=client,
            messages=_messages(article_a=article_a, article_b=article_b),
            cache_dir=cache_dir,
            budget=budget,
            counters=counters,
            payload_validator=_validate_pairwise_payload,
        )
        verdict = _validate_pairwise_payload(payload)
        duplicate_mapped = _map_verdict(
            verdict, candidate_one_is_a=not candidate_one_is_a
        )
        mapped_agreements += duplicate_mapped == primary_mapped
        same_opaque_winners += verdict in {"A", "B"} and verdict == primary_verdict

    counts = Counter(mapped for _, mapped, _ in primary.values())
    value = {
        "schema": PAIRWISE_SCHEMA,
        "benchmarkId": benchmark_id,
        "selectionHash": selection_hash,
        "split": split,
        "caseSetHash": case_set_hash,
        "orderedRunBindings": {
            "candidateOne": candidate_one_binding,
            "candidateTwo": candidate_two_binding,
        },
        "caseCount": len(case_ids),
        "primaryVerdicts": {
            "candidateOne": counts["candidateOne"],
            "candidateTwo": counts["candidateTwo"],
            "tie_good": counts["tie_good"],
            "both_bad": counts["both_bad"],
        },
        "rates": {
            "candidateOneWinRate": _rate(counts["candidateOne"], len(case_ids)),
            "candidateTwoWinRate": _rate(counts["candidateTwo"], len(case_ids)),
            "tieGoodRate": _rate(counts["tie_good"], len(case_ids)),
            "bothBadRate": _rate(counts["both_bad"], len(case_ids)),
        },
        "swappedOrderChecks": {
            "duplicateCount": len(duplicate_case_ids),
            "mappedVerdictAgreementRate": _rate(
                mapped_agreements, len(duplicate_case_ids)
            ),
            "sameOpaqueWinnerRate": _rate(
                same_opaque_winners, len(duplicate_case_ids)
            ),
        },
        "requestBudget": {
            "maxRequests": budget.max_requests,
            "requestCount": counters["requests"],
            "cacheHitCount": counters["cache_hits"],
        },
    }
    write_json(output_path, value)
    return PairwiseResult(
        case_count=len(case_ids),
        request_count=counters["requests"],
        cache_hit_count=counters["cache_hits"],
        candidate_one_wins=counts["candidateOne"],
        candidate_two_wins=counts["candidateTwo"],
        tie_good_count=counts["tie_good"],
        both_bad_count=counts["both_bad"],
        duplicate_count=len(duplicate_case_ids),
        mapped_verdict_agreement_rate=_rate(mapped_agreements, len(duplicate_case_ids)),
        same_opaque_winner_rate=_rate(
            same_opaque_winners, len(duplicate_case_ids)
        ),
    )
