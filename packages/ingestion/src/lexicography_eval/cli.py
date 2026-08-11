from __future__ import annotations

import argparse
from dataclasses import asdict
import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Any

from .benchmark import combine_review_bundles, prepare_benchmark
from .blind import render_blind_review
from .comparison import compare_prompt_runs
from .generation import GenerationBudget, PromptSpec, generate_candidates
from .judging import JudgeBudget, judge_candidates
from .pairwise import PairwiseBudget, judge_pairwise_candidates
from .provider import OpenAIChatClient, load_env_files, provider_config_from_env
from .similarity import SourceTextIndex, source_texts_from_corpus


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return value


def _require_local_output(
    repo_root: Path, path: Path, *, vault: bool = False
) -> Path:
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


def _merge_open_and_holdout_selections(
    open_selection: dict[str, Any], holdout_selection: dict[str, Any]
) -> dict[str, Any]:
    if open_selection.get("schema") != "lexicography-selection-v1" or holdout_selection.get(
        "schema"
    ) != "lexicography-selection-v1":
        raise ValueError("Both benchmark selections must use lexicography-selection-v1")
    if open_selection.get("benchmarkId") != holdout_selection.get("benchmarkId"):
        raise ValueError("Open and holdout selections must share a benchmarkId")
    open_lemmas = list(open_selection.get("lemmas") or [])
    holdout_lemmas = list(holdout_selection.get("lemmas") or [])
    if not open_lemmas or any(item.get("split") == "holdout" for item in open_lemmas):
        raise ValueError("The committed open selection must not expose holdout cases")
    if not holdout_lemmas or any(
        item.get("split") != "holdout" for item in holdout_lemmas
    ):
        raise ValueError("The vault selection must contain only holdout cases")
    expected_count = open_selection.get("reservedHoldoutCaseCount")
    if expected_count is not None and expected_count != len(holdout_lemmas):
        raise ValueError("Vault selection does not match reserved holdout count")
    return {
        "schema": "lexicography-selection-v1",
        "benchmarkId": open_selection.get("benchmarkId"),
        "seed": open_selection.get("seed"),
        "lemmas": open_lemmas + holdout_lemmas,
    }


def _sample_for_split(
    sample: dict[str, Any], split: str, limit: int | None
) -> dict[str, Any]:
    if limit is not None and limit < 1:
        raise ValueError("--limit must be positive")
    result = dict(sample)
    matching = [
        case for case in list(sample.get("cases") or []) if case.get("split") == split
    ]
    result["cases"] = matching if limit is None else matching[:limit]
    result["caseCount"] = len(result["cases"])
    result["meaningCount"] = sum(
        len(case.get("referenceIds") or []) for case in result["cases"]
    )
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


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Clean-room Dutch lexicography prompt evaluation harness"
    )
    parser.add_argument("--repo-root", type=Path, default=Path.cwd())
    parser.add_argument(
        "--env-root",
        type=Path,
        help="Optional trusted checkout containing the existing local Azure .env files",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate CLI shape and report intended effects without reading inputs, calling providers, or writing files",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    prepare = commands.add_parser("prepare")
    prepare.add_argument("--corpus-root", type=Path, required=True)
    prepare.add_argument("--selection", type=Path, required=True)
    prepare.add_argument("--holdout-selection", type=Path, required=True)
    prepare.add_argument("--output-dir", type=Path, required=True)
    prepare.add_argument("--holdout-release-dir", type=Path, required=True)

    generate = commands.add_parser("generate")
    generate.add_argument("--sample", type=Path, required=True)
    generate.add_argument("--prompt", type=Path, required=True)
    generate.add_argument("--run-dir", type=Path, required=True)
    generate.add_argument("--split", choices=["development", "validation", "holdout"], required=True)
    generate.add_argument("--limit", type=int)
    generate.add_argument("--max-requests", type=int, required=True)
    generate.add_argument("--max-output-tokens", type=int, default=1400)
    generate.add_argument("--temperature", type=float, default=0.2)
    generate.add_argument(
        "--model-profile",
        choices=["gpt-4.1", "gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"],
        help="Use an explicit offline Azure model profile without changing OPENAI_MODEL",
    )
    generate.add_argument("--holdout-ledger", type=Path)
    generate.add_argument("--holdout-run-id")

    judge = commands.add_parser("judge")
    judge.add_argument("--sample", type=Path, required=True)
    judge.add_argument("--protected", type=Path, required=True)
    judge.add_argument("--candidate-dir", type=Path, required=True)
    judge.add_argument("--corpus-root", type=Path, required=True)
    judge.add_argument("--output-dir", type=Path, required=True)
    judge.add_argument("--split", choices=["development", "validation", "holdout"], required=True)
    judge.add_argument("--limit", type=int)
    judge.add_argument("--max-requests", type=int, required=True)
    judge.add_argument("--max-output-tokens", type=int, default=1000)
    judge.add_argument(
        "--model-profile",
        choices=["gpt-4.1", "gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"],
        help="Use an explicit offline Azure judge profile without changing OPENAI_MODEL",
    )
    judge.add_argument("--holdout-ledger", type=Path)
    judge.add_argument("--holdout-run-id")

    pairwise = commands.add_parser("judge-pairwise")
    pairwise.add_argument("--sample", type=Path, required=True)
    pairwise.add_argument("--candidate-one-dir", type=Path, required=True)
    pairwise.add_argument("--candidate-two-dir", type=Path, required=True)
    pairwise.add_argument("--output", type=Path, required=True)
    pairwise.add_argument(
        "--split", choices=["development", "validation", "holdout"], required=True
    )
    pairwise.add_argument("--limit", type=int)
    pairwise.add_argument("--seed", required=True)
    pairwise.add_argument("--max-requests", type=int, required=True)
    pairwise.add_argument("--max-output-tokens", type=int, default=300)
    pairwise.add_argument("--swapped-duplicate-count", type=int, default=8)
    pairwise.add_argument(
        "--model-profile",
        choices=["gpt-4.1", "gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"],
        help="Use an explicit offline Azure pairwise-judge profile",
    )

    compare = commands.add_parser("compare")
    compare.add_argument("--incumbent", type=Path, required=True)
    compare.add_argument("--challenger", type=Path, required=True)
    compare.add_argument("--pairwise", type=Path, required=True)
    compare.add_argument("--output", type=Path, required=True)

    assemble = commands.add_parser("assemble-review")
    assemble.add_argument("--open-sample", type=Path, required=True)
    assemble.add_argument("--holdout-sample", type=Path, required=True)
    assemble.add_argument("--open-protected", type=Path, required=True)
    assemble.add_argument("--holdout-protected", type=Path, required=True)
    assemble.add_argument("--output-sample", type=Path, required=True)
    assemble.add_argument("--output-protected", type=Path, required=True)

    blind = commands.add_parser("render-blind")
    blind.add_argument("--sample", type=Path, required=True)
    blind.add_argument("--protected", type=Path, required=True)
    blind.add_argument("--candidate-dir", type=Path, action="append", required=True)
    blind.add_argument("--output-html", type=Path, required=True)
    blind.add_argument("--mapping", type=Path, required=True)
    blind.add_argument(
        "--split",
        choices=["development", "validation", "holdout", "all"],
        required=True,
    )
    blind.add_argument("--seed", required=True)
    blind.add_argument("--repeat-count", type=int, default=8)
    blind.add_argument("--holdout-ledger", type=Path)
    blind.add_argument("--holdout-run-id")
    return parser


def _file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _require_holdout_binding(
    *,
    sample_path: Path,
    sample: dict[str, Any],
    ledger_path: Path | None,
    run_id: str | None,
    prompt_id: str | None,
    prompt_hash: str | None,
    generation_run_dir: Path | None,
    protected_path: Path | None = None,
) -> None:
    if not sample.get("sealed"):
        return
    normalized_run_id = str(run_id or "").strip()
    normalized_prompt_id = str(prompt_id or "").strip()
    normalized_prompt_hash = str(prompt_hash or "").strip()
    if (
        ledger_path is None
        or not normalized_run_id
        or not normalized_prompt_id
        or not normalized_prompt_hash
        or generation_run_dir is None
    ):
        raise ValueError(
            "The sealed holdout requires its release ledger, run ID, frozen prompt, and generation run"
        )
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
    sample_sha = _file_sha256(sample_path)
    if ledger.get("sampleSha256") != sample_sha:
        raise ValueError("Holdout sample no longer matches its immutable release ledger")
    if protected_path is not None:
        protected_path = protected_path.resolve()
        if protected_path.parent != sample_path.parent:
            raise ValueError("Holdout protected references must remain in the release directory")
        if ledger.get("protectedSha256") != _file_sha256(protected_path):
            raise ValueError(
                "Holdout protected references no longer match the immutable release ledger"
            )

    binding_path = ledger_path.parent / str(ledger.get("bindingFile") or "run-binding.json")
    binding = {
        "schema": "lexicography-holdout-run-binding-v1",
        "benchmarkId": sample.get("benchmarkId"),
        "runId": normalized_run_id,
        "promptId": normalized_prompt_id,
        "promptHash": normalized_prompt_hash,
        "generationRunPathHash": hashlib.sha256(
            str(generation_run_dir.resolve()).encode("utf-8")
        ).hexdigest(),
        "sampleSha256": sample_sha,
        "ledgerSha256": _file_sha256(ledger_path),
    }
    if binding_path.exists():
        existing = _read_json(binding_path)
        if existing != binding:
            raise ValueError(
                f"Holdout release is already bound to run {existing.get('runId')!r}"
            )
        return
    rendered = json.dumps(binding, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    try:
        with binding_path.open("x", encoding="utf-8") as stream:
            stream.write(rendered)
    except FileExistsError:
        existing = _read_json(binding_path)
        if existing != binding:
            raise ValueError(
                f"Holdout release is already bound to run {existing.get('runId')!r}"
            ) from None
    os.chmod(binding_path, 0o400)


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    repo_root = args.repo_root.resolve()
    env_root = (args.env_root or repo_root).resolve()

    if args.dry_run:
        _json_result(
            {
                "schema": "lexicography-dry-run-v1",
                "dryRun": True,
                "command": args.command,
                "wouldCallProvider": args.command
                in {"generate", "judge", "judge-pairwise"},
                "wouldWrite": True,
                "maxRequests": getattr(args, "max_requests", None),
                "modelProfile": getattr(args, "model_profile", None),
            }
        )
        return 0

    if args.command == "prepare":
        output = _require_local_output(repo_root, args.output_dir)
        release = _require_local_output(
            repo_root, args.holdout_release_dir, vault=True
        )
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
        _json_result(result)
        return 0

    if args.command == "generate":
        sample = _read_json(args.sample)
        prompt = _prompt(args.prompt)
        run_dir = _require_local_output(repo_root, args.run_dir)
        _require_holdout_binding(
            sample_path=args.sample,
            sample=sample,
            ledger_path=args.holdout_ledger,
            run_id=args.holdout_run_id,
            prompt_id=prompt.prompt_id,
            prompt_hash=prompt.prompt_hash,
            generation_run_dir=run_dir,
        )
        result = generate_candidates(
            sample=_sample_for_split(sample, args.split, args.limit),
            prompt=prompt,
            client=_client(env_root, model_profile=args.model_profile),
            run_dir=run_dir,
            split=args.split,
            budget=GenerationBudget(
                max_requests=args.max_requests,
                max_output_tokens=args.max_output_tokens,
                temperature=args.temperature,
            ),
        )
        _json_result(result)
        return 0

    if args.command == "judge":
        sample = _read_json(args.sample)
        candidate_dir = args.candidate_dir.resolve()
        generation_manifest = _read_json(candidate_dir.parent / "run-manifest.json")
        generation_prompt = generation_manifest.get("prompt") or {}
        _require_holdout_binding(
            sample_path=args.sample,
            sample=sample,
            ledger_path=args.holdout_ledger,
            run_id=args.holdout_run_id,
            prompt_id=generation_prompt.get("promptId"),
            prompt_hash=generation_prompt.get("promptHash"),
            generation_run_dir=candidate_dir.parent,
            protected_path=args.protected,
        )
        source_index = SourceTextIndex(
            source_texts_from_corpus(args.corpus_root.resolve())
        )
        result = judge_candidates(
            sample=_sample_for_split(sample, args.split, args.limit),
            protected=_read_json(args.protected),
            candidate_dir=candidate_dir,
            source_index=source_index,
            client=_client(
                env_root,
                model_profile=args.model_profile,
                require_source_aware_azure=True,
            ),
            output_dir=_require_local_output(repo_root, args.output_dir),
            split=args.split,
            budget=JudgeBudget(
                max_requests=args.max_requests,
                max_output_tokens=args.max_output_tokens,
            ),
        )
        _json_result(result)
        return 0

    if args.command == "judge-pairwise":
        output_path = _require_local_output(repo_root, args.output)
        result = judge_pairwise_candidates(
            sample=_sample_for_split(_read_json(args.sample), args.split, args.limit),
            candidate_one_dir=args.candidate_one_dir.resolve(),
            candidate_two_dir=args.candidate_two_dir.resolve(),
            client=_client(env_root, model_profile=args.model_profile),
            output_path=output_path,
            budget=PairwiseBudget(
                max_requests=args.max_requests,
                max_output_tokens=args.max_output_tokens,
                swapped_duplicate_count=args.swapped_duplicate_count,
            ),
            randomization_seed=args.seed,
        )
        _json_result(result)
        return 0

    if args.command == "compare":
        result = compare_prompt_runs(
            incumbent_dir=args.incumbent.resolve(),
            challenger_dir=args.challenger.resolve(),
            pairwise_path=args.pairwise.resolve(),
            output_path=_require_local_output(repo_root, args.output),
        )
        _json_result(result)
        return 0

    if args.command == "assemble-review":
        result = combine_review_bundles(
            open_sample=_read_json(args.open_sample),
            holdout_sample=_read_json(args.holdout_sample),
            open_protected=_read_json(args.open_protected),
            holdout_protected=_read_json(args.holdout_protected),
            public_path=_require_local_output(repo_root, args.output_sample),
            protected_path=_require_local_output(
                repo_root, args.output_protected, vault=True
            ),
        )
        _json_result(result)
        return 0

    if args.command == "render-blind":
        sample = _read_json(args.sample)
        candidate_dirs = [path.resolve() for path in args.candidate_dir]
        if sample.get("sealed") and len(candidate_dirs) != 1:
            raise ValueError("A sealed holdout review requires exactly one candidate run")
        generation_manifest = _read_json(
            candidate_dirs[0].parent / "run-manifest.json"
        )
        generation_prompt = generation_manifest.get("prompt") or {}
        _require_holdout_binding(
            sample_path=args.sample,
            sample=sample,
            ledger_path=args.holdout_ledger,
            run_id=args.holdout_run_id,
            prompt_id=generation_prompt.get("promptId"),
            prompt_hash=generation_prompt.get("promptHash"),
            generation_run_dir=candidate_dirs[0].parent,
            protected_path=args.protected,
        )
        result = render_blind_review(
            sample=sample,
            protected=_read_json(args.protected),
            candidate_dir=candidate_dirs,
            output_html=_require_local_output(repo_root, args.output_html),
            mapping_path=_require_local_output(repo_root, args.mapping, vault=True),
            split=args.split,
            seed=args.seed,
            repeat_count=args.repeat_count,
        )
        _json_result(result)
        return 0

    parser.error(f"Unsupported command: {args.command}")
    return 2


if __name__ == "__main__":
    sys.exit(main())
