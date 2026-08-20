from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Any

from .artifacts import sha256
from .candidate_schema import apply_output_policy, validate_generated_content


def bind_protected_cases(
    *,
    sample: dict[str, Any],
    protected: dict[str, Any],
    cases: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Bind protected reference text to the exact public selection and cases."""
    if protected.get("schema") != "lexicography-protected-references-v1":
        raise ValueError("Protected bundle uses an unsupported schema")
    for field in ("benchmarkId", "selectionHash"):
        if protected.get(field) != sample.get(field):
            raise ValueError(f"Protected bundle {field} does not match the public sample")
    raw_protected_cases = protected.get("cases")
    if not isinstance(raw_protected_cases, list):
        raise ValueError("Protected bundle cases must be an array")
    protected_by_id: dict[str, dict[str, Any]] = {}
    for protected_case in raw_protected_cases:
        if not isinstance(protected_case, dict):
            raise ValueError("Protected bundle cases must be objects")
        case_id = protected_case.get("caseId")
        if not isinstance(case_id, str) or not case_id or case_id in protected_by_id:
            raise ValueError("Protected bundle case IDs must be unique")
        protected_by_id[case_id] = protected_case

    result: dict[str, dict[str, Any]] = {}
    for case in cases:
        case_id = str(case.get("caseId") or "")
        protected_case = protected_by_id.get(case_id)
        generation_input = case.get("generationInput")
        if not isinstance(protected_case, dict) or not isinstance(generation_input, dict):
            raise ValueError(f"Missing protected references for {case_id}")
        if (
            protected_case.get("split") != case.get("split")
            or protected_case.get("headword") != generation_input.get("headword")
            or protected_case.get("partOfSpeech") != generation_input.get("partOfSpeech")
        ):
            raise ValueError(f"Protected case {case_id} does not match its public identity")
        references = protected_case.get("references")
        reference_ids = case.get("referenceIds") or []
        if not isinstance(references, list) or not isinstance(reference_ids, list):
            raise ValueError(f"Protected case {case_id} has invalid references")
        if reference_ids:
            derived_ids = [
                f"ref_{str(reference.get('sourceHash') or '')[:16]}"
                for reference in references
                if isinstance(reference, dict)
            ]
            if len(derived_ids) != len(references) or derived_ids != reference_ids:
                raise ValueError(
                    f"Protected case {case_id} does not match its public reference IDs"
                )
        elif references and len(references) != len(reference_ids):
            raise ValueError(f"Protected case {case_id} has unexpected references")
        result[case_id] = protected_case
    return result


def sample_for_generation_run(
    sample: dict[str, Any], cases: list[dict[str, Any]], *, split: str
) -> dict[str, Any]:
    value = {
        "schema": "lexicography-sample-v1",
        "benchmarkId": sample.get("benchmarkId"),
        "selectionHash": sample.get("selectionHash"),
        "caseCount": len(cases),
        "meaningCount": sum(len(case.get("referenceIds") or []) for case in cases),
        "cases": cases,
    }
    if split == "holdout":
        value["sealed"] = True
    return value


def load_bound_candidates(
    *,
    sample: dict[str, Any],
    candidate_dir: Path,
    cases: list[dict[str, Any]],
    split: str,
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    """Validate every candidate against its manifest and immutable request cache."""
    scoped_sample = sample_for_generation_run(sample, cases, split=split)
    manifest = generation_manifest(
        sample=scoped_sample, candidate_dir=candidate_dir, split=split
    )
    expected_ids = {str(case.get("caseId") or "") for case in cases}
    actual_ids = {path.stem for path in candidate_dir.glob("*.json")}
    if actual_ids != expected_ids:
        raise ValueError("Candidate directory must exactly match its generation sample")
    result: dict[str, dict[str, Any]] = {}
    for case in cases:
        case_id = str(case.get("caseId") or "")
        generation_input = case.get("generationInput")
        if not case_id or not isinstance(generation_input, dict):
            raise ValueError("Generation cases require caseId and generationInput")
        candidate_path = candidate_dir / f"{case_id}.json"
        candidate = json.loads(candidate_path.read_text(encoding="utf-8"))
        if not isinstance(candidate, dict) or candidate.get("schema") != "lexicography-candidate-v1":
            raise ValueError(f"Candidate {case_id} uses an unsupported schema")
        validate_candidate_binding(
            candidate,
            case_id=case_id,
            candidate_dir=candidate_dir,
            generation_input=generation_input,
            sample=scoped_sample,
            split=split,
            manifest=manifest,
        )
        result[case_id] = candidate
    return result, manifest


def generation_manifest(
    *,
    sample: dict[str, Any],
    candidate_dir: Path,
    split: str,
) -> dict[str, Any]:
    manifest_path = candidate_dir.parent / "run-manifest.json"
    if not manifest_path.is_file():
        raise ValueError("Candidate directory is missing its generation run manifest")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema") != "lexicography-run-manifest-v1" or manifest.get(
        "kind"
    ) != "generation":
        raise ValueError("Candidate generation run manifest uses an unsupported schema")
    expected = {
        "benchmarkId": sample.get("benchmarkId"),
        "selectionHash": sample.get("selectionHash"),
        "sampleHash": sha256(sample),
        "split": split,
    }
    actual = {key: manifest.get(key) for key in expected}
    if actual != expected:
        raise ValueError("Candidate generation manifest does not match the judging sample")
    prompt = manifest.get("prompt")
    if (
        not isinstance(prompt, dict)
        or not prompt.get("promptId")
        or not prompt.get("promptHash")
        or not manifest.get("model")
        or not manifest.get("endpointFingerprint")
    ):
        raise ValueError("Candidate generation manifest is missing immutable provenance")
    return manifest


def validate_candidate_binding(
    candidate: dict[str, Any],
    *,
    case_id: str,
    candidate_dir: Path,
    generation_input: dict[str, Any],
    sample: dict[str, Any],
    split: str,
    manifest: dict[str, Any],
) -> None:
    prompt = manifest["prompt"]
    expected = {
        "caseId": case_id,
        "benchmarkId": sample.get("benchmarkId"),
        "split": split,
        "promptId": prompt.get("promptId"),
        "promptHash": prompt.get("promptHash"),
        "model": manifest.get("model"),
        "endpointFingerprint": manifest.get("endpointFingerprint"),
    }
    provider_metadata = candidate.get("providerMetadata")
    actual = {
        "caseId": candidate.get("caseId"),
        "benchmarkId": candidate.get("benchmarkId"),
        "split": candidate.get("split"),
        "promptId": candidate.get("promptId"),
        "promptHash": candidate.get("promptHash"),
        "model": candidate.get("model"),
        "endpointFingerprint": (
            provider_metadata.get("endpointFingerprint")
            if isinstance(provider_metadata, dict)
            else None
        ),
    }
    request_hash = candidate.get("requestHash")
    if actual != expected or not isinstance(request_hash, str) or not re.fullmatch(
        r"[0-9a-f]{64}", request_hash
    ):
        raise ValueError(f"Candidate {case_id} is not bound to its generation run")
    cache_path = candidate_dir.parent / "cache" / f"{request_hash}.json"
    if not cache_path.is_file():
        raise ValueError(f"Candidate {case_id} is missing its immutable request cache")
    cache = json.loads(cache_path.read_text(encoding="utf-8"))
    cache_descriptor = {
        "schema": cache.get("schema"),
        "requestHash": cache.get("requestHash"),
        "model": cache.get("model"),
        "endpointFingerprint": cache.get("endpointFingerprint"),
    }
    expected_cache_descriptor = {
        "schema": "lexicography-request-cache-v1",
        "requestHash": request_hash,
        "model": manifest.get("model"),
        "endpointFingerprint": manifest.get("endpointFingerprint"),
    }
    if cache_descriptor != expected_cache_descriptor:
        raise ValueError(f"Candidate {case_id} request cache provenance is invalid")
    cached_content = apply_output_policy(
        validate_generated_content(cache.get("payload") or {}, generation_input),
        force_empty_optional_fields=bool(
            manifest["prompt"].get("forceEmptyOptionalFields", False)
        ),
    )
    if sha256(cached_content) != sha256(candidate.get("content")):
        raise ValueError(f"Candidate {case_id} differs from its immutable request cache")
