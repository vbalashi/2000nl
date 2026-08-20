from __future__ import annotations

import argparse
from pathlib import Path
import sys

from .command_handlers import execute_command


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
    generate.add_argument(
        "--preflight-run-dir",
        type=Path,
        help="Required matching five-case run before generating more than five development cases",
    )
    generate.add_argument(
        "--preflight-sample",
        type=Path,
        help="Public sample that owns the five development preflight cases (required for sealed holdout)",
    )

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
        "--split", choices=["development", "validation"], required=True
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
    compare.add_argument("--tournament-ledger", type=Path, required=True)
    compare.add_argument(
        "--phase", choices=["development", "validation"], required=True
    )

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


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return execute_command(args)


if __name__ == "__main__":
    sys.exit(main())
