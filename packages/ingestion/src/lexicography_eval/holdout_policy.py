from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

from .release_policy import PILOT_BENCHMARK_ID
from .tournament_policy import validated_tournament_release


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return value


def _file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require_complete_sealed_holdout(
    *, sample: dict[str, Any], split: str, limit: int | None
) -> None:
    if not sample.get("sealed"):
        return
    cases = sample.get("cases")
    if (
        split != "holdout"
        or limit is not None
        or not isinstance(cases, list)
        or not cases
        or any(not isinstance(case, dict) or case.get("split") != "holdout" for case in cases)
        or sample.get("caseCount") != len(cases)
        or (sample.get("benchmarkId") == PILOT_BENCHMARK_ID and len(cases) != 12)
    ):
        raise ValueError("A sealed holdout must run its complete immutable case set without --limit")


def require_holdout_binding(
    *,
    sample_path: Path,
    sample: dict[str, Any],
    ledger_path: Path | None,
    finalist_path: Path,
    tournament_ledger_path: Path | None,
    run_id: str | None,
    prompt_id: str | None,
    prompt_hash: str | None,
    model: str | None,
    generation_run_dir: Path | None,
    protected_path: Path | None = None,
) -> None:
    if not sample.get("sealed"):
        return
    normalized_run_id = str(run_id or "").strip()
    normalized_prompt_id = str(prompt_id or "").strip()
    normalized_prompt_hash = str(prompt_hash or "").strip()
    normalized_model = str(model or "").strip()
    if (
        ledger_path is None or not normalized_run_id or not normalized_prompt_id
        or not normalized_prompt_hash or not normalized_model
        or generation_run_dir is None
    ):
        raise ValueError("The sealed holdout requires its release ledger, run ID, frozen prompt, model, and generation run")
    if len(normalized_run_id) > 128 or any(
        character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"
        for character in normalized_run_id
    ):
        raise ValueError("Holdout run ID contains unsupported characters")

    sample_path = sample_path.resolve()
    ledger_path = ledger_path.resolve()
    if sample_path.parent != ledger_path.parent:
        raise ValueError("Holdout sample and release ledger must share a release directory")
    ledger = _read_json(ledger_path)
    if ledger.get("schema") != "lexicography-holdout-release-ledger-v1":
        raise ValueError("Holdout release ledger has an unsupported schema")
    if ledger.get("benchmarkId") != sample.get("benchmarkId"):
        raise ValueError("Holdout release ledger benchmark does not match the sample")
    if ledger.get("selectionHash") != sample.get("selectionHash"):
        raise ValueError("Holdout release ledger selection does not match the sample")
    sample_sha = _file_sha256(sample_path)
    if ledger.get("sampleSha256") != sample_sha:
        raise ValueError("Holdout sample no longer matches its immutable release ledger")
    if protected_path is not None:
        protected_path = protected_path.resolve()
        if protected_path.parent != sample_path.parent:
            raise ValueError("Holdout protected references must remain in the release directory")
        if ledger.get("protectedSha256") != _file_sha256(protected_path):
            raise ValueError("Holdout protected references no longer match the immutable release ledger")

    binding_path = ledger_path.parent / str(ledger.get("bindingFile") or "run-binding.json")
    finalist_path = finalist_path.resolve()
    finalist = _read_json(finalist_path)
    generator = finalist.get("generator") or {}
    expected_finalist = {
        "benchmarkId": sample.get("benchmarkId"),
        "selectionHash": sample.get("selectionHash"),
        "promptId": normalized_prompt_id,
        "promptHash": normalized_prompt_hash,
        "model": normalized_model,
    }
    actual_finalist = {
        "benchmarkId": finalist.get("benchmarkId"),
        "selectionHash": finalist.get("selectionHash"),
        "promptId": generator.get("promptId"),
        "promptHash": generator.get("promptHash"),
        "model": generator.get("model"),
    }
    if finalist.get("schema") != "lexicography-finalist-decision-v1" or actual_finalist != expected_finalist:
        raise ValueError("Sealed holdout does not match the frozen validation finalist")

    protocol = finalist.get("selectionProtocol")
    tournament_binding: dict[str, Any] = {}
    if protocol == "tournament-ledger-v2":
        if tournament_ledger_path is None:
            raise ValueError("Sealed holdout requires its canonical validation tournament")
        tournament = validated_tournament_release(tournament_ledger_path.resolve())
        expected_tournament = {
            "benchmarkId": sample.get("benchmarkId"),
            "selectionHash": sample.get("selectionHash"),
            "finalist": {
                "promptId": normalized_prompt_id,
                "promptHash": normalized_prompt_hash,
                "model": normalized_model,
            },
            "validationComparisonSha256": finalist.get("validationComparisonSha256"),
            "tournamentLedgerSha256": finalist.get("tournamentLedgerSha256"),
        }
        if tournament != expected_tournament:
            raise ValueError("Finalist decision does not match the canonical validation tournament")
        tournament_binding = {
            "validationComparisonSha256": tournament["validationComparisonSha256"],
            "tournamentLedgerSha256": tournament["tournamentLedgerSha256"],
        }
    elif protocol == "historical-human-validation-v1":
        if not binding_path.exists():
            raise ValueError("Historical validation evidence cannot open a new sealed holdout")
        _validate_historical_evidence(finalist_path=finalist_path, finalist=finalist)
    else:
        raise ValueError("Finalist decision uses an unsupported selection protocol")

    binding = {
        "schema": "lexicography-holdout-run-binding-v1",
        "benchmarkId": sample.get("benchmarkId"),
        "selectionHash": sample.get("selectionHash"),
        "runId": normalized_run_id,
        "promptId": normalized_prompt_id,
        "promptHash": normalized_prompt_hash,
        "model": normalized_model,
        "generationRunPathHash": hashlib.sha256(str(generation_run_dir.resolve()).encode("utf-8")).hexdigest(),
        "sampleSha256": sample_sha,
        "ledgerSha256": _file_sha256(ledger_path),
        "finalistDecisionSha256": _file_sha256(finalist_path),
        **tournament_binding,
    }
    if binding_path.exists():
        existing = _read_json(binding_path)
        if not _existing_binding_matches(existing, binding):
            raise ValueError(f"Holdout release is already bound to run {existing.get('runId')!r}")
        return
    rendered = json.dumps(binding, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    try:
        with binding_path.open("x", encoding="utf-8") as stream:
            stream.write(rendered)
    except FileExistsError:
        existing = _read_json(binding_path)
        if not _existing_binding_matches(existing, binding):
            raise ValueError(f"Holdout release is already bound to run {existing.get('runId')!r}") from None
    os.chmod(binding_path, 0o400)


def _existing_binding_matches(
    existing: dict[str, Any], expected: dict[str, Any]
) -> bool:
    legacy_keys = {
        "schema", "benchmarkId", "runId", "promptId", "promptHash",
        "generationRunPathHash", "sampleSha256", "ledgerSha256",
    }
    return (
        legacy_keys.issubset(existing)
        and set(existing).issubset(expected)
        and all(expected[key] == value for key, value in existing.items())
    )


def _validate_historical_evidence(
    *, finalist_path: Path, finalist: dict[str, Any]
) -> None:
    if finalist.get("benchmarkId") != PILOT_BENCHMARK_ID:
        raise ValueError("Historical validation compatibility is limited to the frozen pilot")
    evidence = finalist.get("validationEvidence")
    manifests = evidence.get("candidateManifests") if isinstance(evidence, dict) else None
    if not isinstance(manifests, list) or len(manifests) != 2:
        raise ValueError("Historical finalist decision is missing validation evidence")
    repo_root = finalist_path.parents[3]
    descriptors = []
    for item in manifests:
        if not isinstance(item, dict) or set(item) != {"path", "sha256"}:
            raise ValueError("Historical validation manifest binding is malformed")
        path = (repo_root / str(item["path"])).resolve()
        try:
            path.relative_to(repo_root / "reports/generated/lexicography-eval")
        except ValueError:
            raise ValueError("Historical validation manifest is outside the local evidence root") from None
        if not path.is_file():
            raise ValueError("Historical validation manifest is missing")
        if _file_sha256(path) != item["sha256"]:
            raise ValueError("Historical validation manifest no longer matches the finalist decision")
        manifest = _read_json(path)
        prompt = manifest.get("prompt") or {}
        if (
            manifest.get("schema") != "lexicography-run-manifest-v1"
            or manifest.get("split") != "validation"
            or manifest.get("benchmarkId") != finalist.get("benchmarkId")
            or manifest.get("selectionHash") != finalist.get("selectionHash")
        ):
            raise ValueError("Historical validation manifest has incompatible provenance")
        descriptors.append({
            "promptId": prompt.get("promptId"),
            "promptHash": prompt.get("promptHash"),
            "model": manifest.get("model"),
        })
    generator = finalist.get("generator") or {}
    selected = {
        "promptId": generator.get("promptId"),
        "promptHash": generator.get("promptHash"),
        "model": generator.get("model"),
    }
    if selected not in descriptors or evidence.get("selectedPromptId") != selected["promptId"]:
        raise ValueError("Historical validation evidence does not contain the selected finalist")
