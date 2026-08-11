from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any

from .artifacts import sha256, write_json
from .candidate_schema import validate_generated_content
from .generation import ChatClient
from .judge_prompts import (
    bounded_references,
    claims_messages,
    fidelity_messages,
    optional_claims,
    quality_messages,
)
from .judge_requests import cached_judge_call
from .judgment_provenance import generation_manifest, validate_candidate_binding
from .judgment_schema import (
    JUDGMENT_SCHEMA,
    QUALITY_SCORE_KEYS,
    aggregate_fidelity,
    article_quality_score,
    claim_failures,
    composite_score,
    reference_alignment_score,
    validate_claims_audit,
    validate_fidelity,
    validate_quality,
    zero_fidelity,
)
from .similarity import SourceTextIndex, scan_candidate_against_sources


@dataclass(frozen=True)
class JudgeBudget:
    max_requests: int
    max_output_tokens: int
    temperature: float = 0.0

    def __post_init__(self) -> None:
        if self.max_requests < 2:
            raise ValueError("Judge max_requests must allow at least one judge pair")
        if self.max_output_tokens < 100:
            raise ValueError("Judge max_output_tokens must be at least 100")


@dataclass(frozen=True)
class JudgeResult:
    judged_count: int
    hard_pass_count: int
    request_count: int
    cache_hit_count: int


def judge_candidates(
    *,
    sample: dict[str, Any],
    protected: dict[str, Any],
    candidate_dir: Path,
    source_index: SourceTextIndex,
    client: ChatClient,
    output_dir: Path,
    split: str,
    budget: JudgeBudget,
) -> JudgeResult:
    if sample.get("schema") != "lexicography-sample-v1":
        raise ValueError("Sample must use lexicography-sample-v1")
    if protected.get("schema") != "lexicography-protected-references-v1":
        raise ValueError("Protected bundle uses an unsupported schema")
    protected_by_id = {
        case.get("caseId"): case for case in protected.get("cases") or []
    }
    cases = [case for case in sample.get("cases") or [] if case.get("split") == split]
    if not cases:
        raise ValueError(f"Sample has no cases in split {split}")
    manifest = generation_manifest(
        sample=sample, candidate_dir=candidate_dir, split=split
    )

    cache_dir = output_dir / "cache"
    item_dir = output_dir / "items"
    counters = {"requests": 0, "cache_hits": 0}
    judgments = []
    error_counts: Counter[str] = Counter()
    score_totals: dict[str, list[float]] = defaultdict(list)
    hard_pass_count = 0

    for case in cases:
        case_id = case["caseId"]
        protected_case = protected_by_id.get(case_id)
        if not isinstance(protected_case, dict):
            raise ValueError(f"Missing protected references for {case_id}")
        candidate_path = candidate_dir / f"{case_id}.json"
        if not candidate_path.is_file():
            raise ValueError(f"Missing candidate for {case_id}")
        candidate = json.loads(candidate_path.read_text(encoding="utf-8"))
        if candidate.get("schema") != "lexicography-candidate-v1":
            raise ValueError(f"Candidate {case_id} uses an unsupported schema")
        generation_input = case.get("generationInput")
        if not isinstance(generation_input, dict):
            raise ValueError(f"Sample case {case_id} has invalid generationInput")
        validate_candidate_binding(
            candidate,
            case_id=case_id,
            candidate_dir=candidate_dir,
            generation_input=generation_input,
            sample=sample,
            split=split,
            manifest=manifest,
        )
        content = validate_generated_content(
            candidate.get("content") or {}, generation_input
        )
        candidate = {**candidate, "content": content}

        similarity = scan_candidate_against_sources(candidate, source_index)
        reference_ids = list(case.get("referenceIds") or [])
        # Validate the bounded source-aware input before any provider request.
        protected_references = bounded_references(protected_case, reference_ids)
        # Invalid candidate structure and deterministic source-similarity failures are
        # resolved before any paid model call.
        if similarity.hard_failure:
            quality = {
                "scores": {key: 0.0 for key in QUALITY_SCORE_KEYS},
                "hardFailures": [],
                "errorCodes": [],
                "confidence": 1.0,
            }
            fidelity = zero_fidelity(reference_ids)
            claims_audit = {"claims": []}
            claim_errors: list[str] = []
            claim_hard_failures: list[str] = []
            deterministic_errors = ["suspicious_copy"]
            deterministic_hard_failures = ["source_reproduction"]
        else:
            quality = validate_quality(
                cached_judge_call(
                    client=client,
                    messages=quality_messages(case, candidate),
                    cache_dir=cache_dir,
                    budget=budget,
                    counters=counters,
                    payload_validator=validate_quality,
                )
            )
            if quality["hardFailures"]:
                claims_audit = {"claims": []}
                claim_errors = []
                claim_hard_failures = []
                fidelity = zero_fidelity(reference_ids)
            else:
                claims = optional_claims(candidate)
                if claims:
                    claims_audit = validate_claims_audit(
                        cached_judge_call(
                            client=client,
                            messages=claims_messages(case, candidate, claims),
                            cache_dir=cache_dir,
                            budget=budget,
                            counters=counters,
                            payload_validator=lambda payload: validate_claims_audit(
                                payload, claims
                            ),
                        ),
                        claims,
                    )
                else:
                    claims_audit = {"claims": []}
                claim_errors, claim_hard_failures = claim_failures(claims_audit)
                if claim_hard_failures:
                    fidelity = zero_fidelity(reference_ids)
                else:
                    fidelity_results = []
                    for protected_reference in protected_references:
                        reference_id = protected_reference["referenceId"]
                        fidelity_results.append(
                            validate_fidelity(
                                cached_judge_call(
                                    client=client,
                                    messages=fidelity_messages(
                                        case, candidate, protected_reference
                                    ),
                                    cache_dir=cache_dir,
                                    budget=budget,
                                    counters=counters,
                                    payload_validator=lambda payload, reference_id=reference_id: validate_fidelity(
                                        payload,
                                        reference_ids=[reference_id],
                                        sense_count=len(candidate["content"]["senses"]),
                                    ),
                                ),
                                reference_ids=[reference_id],
                                sense_count=len(candidate["content"]["senses"]),
                            )
                        )
                    fidelity = aggregate_fidelity(fidelity_results)
            deterministic_errors = []
            deterministic_hard_failures = []
        error_codes = sorted(
            set(
                quality["errorCodes"]
                + fidelity["errorCodes"]
                + claim_errors
                + deterministic_errors
            )
        )
        hard_failures = sorted(
            set(
                quality["hardFailures"]
                + fidelity["hardFailures"]
                + claim_hard_failures
                + deterministic_hard_failures
            )
        )
        hard_pass = not similarity.hard_failure and not hard_failures
        if hard_pass:
            hard_pass_count += 1
        error_counts.update(error_codes)
        all_scores = {**quality["scores"], **fidelity["scores"]}
        for key, value in all_scores.items():
            score_totals[key].append(value)
        judgment = {
            "schema": JUDGMENT_SCHEMA,
            "caseId": case_id,
            "benchmarkId": sample.get("benchmarkId"),
            "selectionHash": sample.get("selectionHash"),
            "split": split,
            "promptId": candidate.get("promptId"),
            "promptHash": candidate.get("promptHash"),
            "generationRequestHash": candidate.get("requestHash"),
            "candidateModel": candidate.get("model"),
            "judgeModel": client.model,
            "judgeEndpointFingerprint": client.endpoint_fingerprint,
            "sourceIndexHash": source_index.index_hash,
            "hardPass": hard_pass,
            "hardFailures": hard_failures,
            "errorCodes": error_codes,
            "similarity": {
                "hardFailure": similarity.hard_failure,
                "flags": [
                    {
                        "code": flag.code,
                        "candidateField": flag.candidate_field,
                        "sourceField": flag.source_field,
                        "sourceHash": flag.source_hash,
                        "hard": flag.hard,
                        "detail": flag.detail,
                    }
                    for flag in similarity.flags
                ],
            },
            "quality": quality,
            "claimsAudit": claims_audit,
            "fidelity": fidelity,
            "articleQualityScore": article_quality_score(quality["scores"]),
            "referenceAlignmentScore": reference_alignment_score(fidelity["scores"]),
            "compositeScore": composite_score(quality["scores"], fidelity["scores"]),
            "strata": case.get("strata") or [],
        }
        write_json(item_dir / f"{case_id}.json", judgment)
        judgments.append(judgment)

    aggregate = {
        "schema": "lexicography-judgment-aggregate-v1",
        "benchmarkId": sample.get("benchmarkId"),
        "selectionHash": sample.get("selectionHash"),
        "sampleHash": sha256(sample),
        "protectedHash": sha256(protected),
        "sourceIndexHash": source_index.index_hash,
        "split": split,
        "promptId": judgments[0].get("promptId"),
        "judgeModel": client.model,
        "judgeEndpointFingerprint": client.endpoint_fingerprint,
        "caseCount": len(judgments),
        "hardPassCount": hard_pass_count,
        "hardPassRate": round(hard_pass_count / len(judgments), 4),
        "meanCompositeScore": round(
            sum(item["compositeScore"] for item in judgments) / len(judgments), 4
        ),
        "meanArticleQualityScore": round(
            sum(item["articleQualityScore"] for item in judgments) / len(judgments),
            4,
        ),
        "meanReferenceAlignmentScore": round(
            sum(item["referenceAlignmentScore"] for item in judgments)
            / len(judgments),
            4,
        ),
        "meanScores": {
            key: round(sum(values) / len(values), 4)
            for key, values in sorted(score_totals.items())
        },
        "errorCounts": dict(sorted(error_counts.items())),
        "requestCount": counters["requests"],
        "cacheHitCount": counters["cache_hits"],
    }
    write_json(output_dir / "aggregate.json", aggregate)
    return JudgeResult(
        judged_count=len(judgments),
        hard_pass_count=hard_pass_count,
        request_count=counters["requests"],
        cache_hit_count=counters["cache_hits"],
    )
