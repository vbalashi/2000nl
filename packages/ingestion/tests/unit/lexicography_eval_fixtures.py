from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from lexicography_eval.artifacts import sha256
from lexicography_eval.candidate_schema import apply_output_policy, validate_generated_content
from lexicography_eval.judgment_provenance import sample_for_generation_run


def write_bound_generation_run(
    run_dir: Path,
    *,
    sample: dict[str, Any],
    cases: list[dict[str, Any]],
    split: str,
    articles: dict[str, dict[str, Any]],
    prompt_id: str,
    prompt_hash: str | None = None,
    model: str = "gpt-4.1",
    endpoint_fingerprint: str = "azure:unit-test",
) -> Path:
    candidate_dir = run_dir / "candidates"
    cache_dir = run_dir / "cache"
    candidate_dir.mkdir(parents=True)
    cache_dir.mkdir(parents=True)
    resolved_prompt_hash = prompt_hash or hashlib.sha256(prompt_id.encode()).hexdigest()
    scoped_sample = sample_for_generation_run(sample, cases, split=split)
    for case in cases:
        case_id = str(case["caseId"])
        content = apply_output_policy(
            validate_generated_content(articles[case_id], case["generationInput"]),
            force_empty_optional_fields=False,
        )
        request_hash = hashlib.sha256(f"{prompt_id}:{case_id}".encode()).hexdigest()
        cache = {
            "schema": "lexicography-request-cache-v1",
            "requestHash": request_hash,
            "model": model,
            "endpointFingerprint": endpoint_fingerprint,
            "payload": content,
        }
        (cache_dir / f"{request_hash}.json").write_text(
            json.dumps(cache), encoding="utf-8"
        )
        candidate = {
            "schema": "lexicography-candidate-v1",
            "caseId": case_id,
            "benchmarkId": sample.get("benchmarkId"),
            "split": split,
            "promptId": prompt_id,
            "promptHash": resolved_prompt_hash,
            "model": model,
            "requestHash": request_hash,
            "content": content,
            "providerMetadata": {"endpointFingerprint": endpoint_fingerprint},
        }
        (candidate_dir / f"{case_id}.json").write_text(
            json.dumps(candidate), encoding="utf-8"
        )
    manifest = {
        "schema": "lexicography-run-manifest-v1",
        "kind": "generation",
        "benchmarkId": sample.get("benchmarkId"),
        "selectionHash": sample.get("selectionHash"),
        "sampleHash": sha256(scoped_sample),
        "split": split,
        "prompt": {
            "promptId": prompt_id,
            "promptHash": resolved_prompt_hash,
            "forceEmptyOptionalFields": False,
        },
        "model": model,
        "endpointFingerprint": endpoint_fingerprint,
        "candidateCount": len(cases),
    }
    (run_dir / "run-manifest.json").write_text(
        json.dumps(manifest), encoding="utf-8"
    )
    return candidate_dir
