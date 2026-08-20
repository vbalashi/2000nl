from __future__ import annotations

from argparse import Namespace
from dataclasses import asdict
import json
from pathlib import Path
from typing import Any

from .benchmark import combine_review_bundles, prepare_benchmark
from .blind import render_blind_review
from .comparison import compare_prompt_runs
from .generation import GenerationBudget, PromptSpec, generate_candidates
from .judging import JudgeBudget, judge_candidates
from .pairwise import PairwiseBudget, judge_pairwise_candidates
from .provider import OpenAIChatClient, load_env_files, provider_config_from_env
from .release_policy import (
    merge_open_and_holdout_selections as _merge_open_and_holdout_selections,
    require_development_preflight,
    require_holdout_binding as _require_holdout_binding,
)
from .similarity import SourceTextIndex, source_texts_from_corpus


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return value


def _require_local_output(repo_root: Path, path: Path, *, vault: bool = False) -> Path:
    root_name = "lexicography-eval-vault" if vault else "lexicography-eval"
    allowed_root = (repo_root.resolve() / "reports" / "generated" / root_name).resolve()
    resolved = path.resolve()
    try:
        resolved.relative_to(allowed_root)
    except ValueError:
        label = "holdout vault" if vault else "ignored local evaluation root"
        raise ValueError(f"Output must remain below the {label}: {allowed_root}") from None
    return resolved


def _prompt(path: Path) -> PromptSpec:
    value = _read_json(path)
    if value.get("schema") != "lexicography-prompt-v1":
        raise ValueError("Prompt must use lexicography-prompt-v1")
    return PromptSpec(
        prompt_id=str(value.get("promptId") or "").strip(),
        system_text=str(value.get("systemText") or "").strip(),
        user_instructions=str(value.get("userInstructions") or "").strip(),
        parent_prompt_id=value.get("parentPromptId"),
        change_rationale=value.get("changeRationale"),
        force_empty_optional_fields=bool(value.get("forceEmptyOptionalFields", False)),
    )


def _sample_for_split(sample: dict[str, Any], split: str, limit: int | None) -> dict[str, Any]:
    if limit is not None and limit < 1:
        raise ValueError("--limit must be positive")
    result = dict(sample)
    matching = [case for case in list(sample.get("cases") or []) if case.get("split") == split]
    result["cases"] = matching if limit is None else matching[:limit]
    result["caseCount"] = len(result["cases"])
    result["meaningCount"] = sum(len(case.get("referenceIds") or []) for case in result["cases"])
    return result


def _client(
    repo_root: Path,
    *,
    model_profile: str | None = None,
    require_source_aware_azure: bool = False,
) -> OpenAIChatClient:
    environment = load_env_files(repo_root)
    return OpenAIChatClient(
        provider_config_from_env(
            environment,
            model_override=model_profile,
            require_source_aware_azure=require_source_aware_azure,
        )
    )


def _json_result(value: Any) -> None:
    if hasattr(value, "__dataclass_fields__"):
        value = asdict(value)
    print(json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2))


def execute_command(args: Namespace) -> int:
    repo_root = args.repo_root.resolve()
    env_root = (args.env_root or repo_root).resolve()
    if args.dry_run:
        _json_result({
            "schema": "lexicography-dry-run-v1",
            "dryRun": True,
            "command": args.command,
            "wouldCallProvider": args.command in {"generate", "judge", "judge-pairwise"},
            "wouldWrite": True,
            "maxRequests": getattr(args, "max_requests", None),
            "modelProfile": getattr(args, "model_profile", None),
        })
        return 0

    if args.command == "prepare":
        output = _require_local_output(repo_root, args.output_dir)
        release = _require_local_output(repo_root, args.holdout_release_dir, vault=True)
        result = prepare_benchmark(
            corpus_root=args.corpus_root.resolve(),
            selection=_merge_open_and_holdout_selections(
                _read_json(args.selection), _read_json(args.holdout_selection)
            ),
            public_path=output / "sample.json",
            protected_path=output / "protected-references.json",
            holdout_path=release / "sealed-holdout.json",
            holdout_protected_path=release / "protected-references.json",
            holdout_ledger_path=release / "release-ledger.json",
        )
    elif args.command == "generate":
        sample = _read_json(args.sample)
        prompt = _prompt(args.prompt)
        run_dir = _require_local_output(repo_root, args.run_dir)
        _require_holdout_binding(
            sample_path=args.sample, sample=sample, ledger_path=args.holdout_ledger,
            run_id=args.holdout_run_id, prompt_id=prompt.prompt_id,
            prompt_hash=prompt.prompt_hash, generation_run_dir=run_dir,
        )
        client = _client(env_root, model_profile=args.model_profile)
        preflight_run_dir = (
            _require_local_output(repo_root, args.preflight_run_dir)
            if args.preflight_run_dir is not None else None
        )
        require_development_preflight(
            sample=sample, split=args.split, limit=args.limit,
            preflight_run_dir=preflight_run_dir, prompt_id=prompt.prompt_id,
            prompt_hash=prompt.prompt_hash, model=client.model,
            endpoint_fingerprint=client.endpoint_fingerprint,
        )
        result = generate_candidates(
            sample=_sample_for_split(sample, args.split, args.limit), prompt=prompt,
            client=client, run_dir=run_dir, split=args.split,
            budget=GenerationBudget(
                max_requests=args.max_requests, max_output_tokens=args.max_output_tokens,
                temperature=args.temperature,
            ),
        )
    elif args.command == "judge":
        sample = _read_json(args.sample)
        candidate_dir = args.candidate_dir.resolve()
        generation_prompt = (_read_json(candidate_dir.parent / "run-manifest.json").get("prompt") or {})
        _require_holdout_binding(
            sample_path=args.sample, sample=sample, ledger_path=args.holdout_ledger,
            run_id=args.holdout_run_id, prompt_id=generation_prompt.get("promptId"),
            prompt_hash=generation_prompt.get("promptHash"),
            generation_run_dir=candidate_dir.parent, protected_path=args.protected,
        )
        result = judge_candidates(
            sample=_sample_for_split(sample, args.split, args.limit),
            protected=_read_json(args.protected), candidate_dir=candidate_dir,
            source_index=SourceTextIndex(source_texts_from_corpus(args.corpus_root.resolve())),
            client=_client(env_root, model_profile=args.model_profile, require_source_aware_azure=True),
            output_dir=_require_local_output(repo_root, args.output_dir), split=args.split,
            budget=JudgeBudget(max_requests=args.max_requests, max_output_tokens=args.max_output_tokens),
        )
    elif args.command == "judge-pairwise":
        result = judge_pairwise_candidates(
            sample=_sample_for_split(_read_json(args.sample), args.split, args.limit),
            candidate_one_dir=args.candidate_one_dir.resolve(),
            candidate_two_dir=args.candidate_two_dir.resolve(),
            client=_client(env_root, model_profile=args.model_profile),
            output_path=_require_local_output(repo_root, args.output),
            budget=PairwiseBudget(
                max_requests=args.max_requests, max_output_tokens=args.max_output_tokens,
                swapped_duplicate_count=args.swapped_duplicate_count,
            ),
            randomization_seed=args.seed,
        )
    elif args.command == "compare":
        result = compare_prompt_runs(
            incumbent_dir=args.incumbent.resolve(), challenger_dir=args.challenger.resolve(),
            pairwise_path=args.pairwise.resolve(),
            output_path=_require_local_output(repo_root, args.output),
        )
    elif args.command == "assemble-review":
        result = combine_review_bundles(
            open_sample=_read_json(args.open_sample), holdout_sample=_read_json(args.holdout_sample),
            open_protected=_read_json(args.open_protected),
            holdout_protected=_read_json(args.holdout_protected),
            public_path=_require_local_output(repo_root, args.output_sample),
            protected_path=_require_local_output(repo_root, args.output_protected, vault=True),
        )
    elif args.command == "render-blind":
        sample = _read_json(args.sample)
        candidate_dirs = [path.resolve() for path in args.candidate_dir]
        if sample.get("sealed") and len(candidate_dirs) != 1:
            raise ValueError("A sealed holdout review requires exactly one candidate run")
        generation_prompt = (_read_json(candidate_dirs[0].parent / "run-manifest.json").get("prompt") or {})
        _require_holdout_binding(
            sample_path=args.sample, sample=sample, ledger_path=args.holdout_ledger,
            run_id=args.holdout_run_id, prompt_id=generation_prompt.get("promptId"),
            prompt_hash=generation_prompt.get("promptHash"),
            generation_run_dir=candidate_dirs[0].parent, protected_path=args.protected,
        )
        result = render_blind_review(
            sample=sample, protected=_read_json(args.protected), candidate_dir=candidate_dirs,
            output_html=_require_local_output(repo_root, args.output_html),
            mapping_path=_require_local_output(repo_root, args.mapping, vault=True),
            split=args.split, seed=args.seed, repeat_count=args.repeat_count,
        )
    else:
        raise ValueError(f"Unsupported command: {args.command}")

    _json_result(result)
    return 0
