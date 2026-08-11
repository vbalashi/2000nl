from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Any

from .artifacts import sha256
from .candidate_schema import apply_output_policy, validate_generated_content


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
