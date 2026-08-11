from __future__ import annotations

import json
from pathlib import Path
import sys

import pytest


INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))

from lexicography_eval.cli import (  # noqa: E402
    build_parser,
    _require_local_output,
    _require_holdout_binding,
    _sample_for_split,
    _merge_open_and_holdout_selections,
    main,
)


def test_generate_and_judge_accept_explicit_model_profiles() -> None:
    parser = build_parser()
    common = ["--repo-root", "/tmp/repo", "--env-root", "/tmp/env"]

    generated = parser.parse_args(
        common
        + [
            "generate",
            "--sample",
            "sample.json",
            "--prompt",
            "prompt.json",
            "--run-dir",
            "run",
            "--split",
            "development",
            "--max-requests",
            "1",
            "--model-profile",
            "gpt-5.6-luna",
        ]
    )
    judged = parser.parse_args(
        common
        + [
            "judge",
            "--sample",
            "sample.json",
            "--protected",
            "protected.json",
            "--candidate-dir",
            "candidates",
            "--corpus-root",
            "corpus",
            "--output-dir",
            "judgments",
            "--split",
            "development",
            "--max-requests",
            "1",
            "--model-profile",
            "gpt-5.6-terra",
        ]
    )

    assert generated.model_profile == "gpt-5.6-luna"
    assert judged.model_profile == "gpt-5.6-terra"


def test_dry_run_describes_paid_command_without_reading_inputs(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    result = main(
        [
            "--repo-root",
            str(tmp_path),
            "--dry-run",
            "generate",
            "--sample",
            "missing-sample.json",
            "--prompt",
            "missing-prompt.json",
            "--run-dir",
            "missing-run",
            "--split",
            "development",
            "--max-requests",
            "7",
        ]
    )

    assert result == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload == {
        "command": "generate",
        "dryRun": True,
        "maxRequests": 7,
        "modelProfile": None,
        "schema": "lexicography-dry-run-v1",
        "wouldCallProvider": True,
        "wouldWrite": True,
    }


@pytest.mark.parametrize(
    ("command", "arguments", "would_call_provider"),
    [
        (
            "prepare",
            [
                "--corpus-root", "missing-corpus", "--selection", "missing-open.json",
                "--holdout-selection", "missing-holdout.json", "--output-dir", "missing-output",
                "--holdout-release-dir", "missing-release",
            ],
            False,
        ),
        (
            "judge",
            [
                "--sample", "missing-sample.json", "--protected", "missing-protected.json",
                "--candidate-dir", "missing-candidates", "--corpus-root", "missing-corpus",
                "--output-dir", "missing-output", "--split", "development",
                "--max-requests", "2",
            ],
            True,
        ),
        (
            "judge-pairwise",
            [
                "--sample", "missing-sample.json", "--candidate-one-dir", "missing-a",
                "--candidate-two-dir", "missing-b", "--output", "missing-output.json",
                "--split", "development", "--seed", "test-seed", "--max-requests", "3",
            ],
            True,
        ),
        (
            "compare",
            [
                "--incumbent", "missing-a", "--challenger", "missing-b",
                "--pairwise", "missing-pairwise.json", "--output", "missing.json",
            ],
            False,
        ),
        (
            "assemble-review",
            [
                "--open-sample", "missing-open.json", "--holdout-sample", "missing-holdout.json",
                "--open-protected", "missing-open-protected.json", "--holdout-protected", "missing-holdout-protected.json",
                "--output-sample", "missing-output.json", "--output-protected", "missing-protected-output.json",
            ],
            False,
        ),
        (
            "render-blind",
            [
                "--sample", "missing-sample.json", "--protected", "missing-protected.json",
                "--candidate-dir", "missing-candidates", "--output-html", "missing.html",
                "--mapping", "missing-mapping.json", "--split", "all", "--seed", "test-seed",
            ],
            False,
        ),
    ],
)
def test_every_other_public_command_supports_side_effect_free_dry_run(
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
    command: str,
    arguments: list[str],
    would_call_provider: bool,
) -> None:
    result = main(
        ["--repo-root", str(tmp_path), "--dry-run", command, *arguments]
    )

    assert result == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["command"] == command
    assert payload["wouldCallProvider"] is would_call_provider
    assert payload["wouldWrite"] is True
    assert list(tmp_path.iterdir()) == []


def test_output_artifacts_are_restricted_to_ignored_local_roots(tmp_path: Path) -> None:
    visible = tmp_path / "reports" / "generated" / "lexicography-eval" / "run"
    vault = tmp_path / "reports" / "generated" / "lexicography-eval-vault" / "release"

    assert _require_local_output(tmp_path, visible) == visible.resolve()
    assert _require_local_output(tmp_path, vault, vault=True) == vault.resolve()
    with pytest.raises(ValueError, match="ignored local evaluation root"):
        _require_local_output(tmp_path, tmp_path / "packages" / "published.json")
    with pytest.raises(ValueError, match="holdout vault"):
        _require_local_output(tmp_path, visible, vault=True)


def test_cli_prepare_writes_visible_protected_and_sealed_manifests(tmp_path: Path) -> None:
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    (corpus / "bank_zn_1.json").write_text(
        json.dumps(
            [
                {
                    "headword": "bank",
                    "part_of_speech": "zn",
                    "meaning_id": 1,
                    "meanings": [{"definition": "een bedrijf", "examples": []}],
                    "_source": {
                        "source_entry_key": "entry:1",
                        "source_group_key": "group:1",
                    },
                }
            ]
        ),
        encoding="utf-8",
    )
    (corpus / "huis_zn_1.json").write_text(
        json.dumps(
            [
                {
                    "headword": "huis",
                    "part_of_speech": "zn",
                    "meaning_id": 1,
                    "meanings": [{"definition": "een gebouw", "examples": []}],
                    "_source": {
                        "source_entry_key": "entry:2",
                        "source_group_key": "group:2",
                    },
                }
            ]
        ),
        encoding="utf-8",
    )
    selection = tmp_path / "selection.json"
    selection.write_text(
        json.dumps(
            {
                "schema": "lexicography-selection-v1",
                "benchmarkId": "cli-test",
                "reservedHoldoutCaseCount": 1,
                "lemmas": [
                    {
                        "headword": "bank",
                        "partOfSpeech": "zn",
                        "selectedMeaningIds": [1],
                        "split": "development",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    holdout_selection = tmp_path / "holdout-selection.json"
    holdout_selection.write_text(
        json.dumps(
            {
                "schema": "lexicography-selection-v1",
                "benchmarkId": "cli-test",
                "lemmas": [
                    {
                        "headword": "huis",
                        "partOfSpeech": "zn",
                        "selectedMeaningIds": [1],
                        "split": "holdout",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    output = tmp_path / "reports" / "generated" / "lexicography-eval" / "prepared"
    release = tmp_path / "reports" / "generated" / "lexicography-eval-vault" / "holdout-release"

    assert (
        main(
            [
                "--repo-root",
                str(tmp_path),
                "prepare",
                "--corpus-root",
                str(corpus),
                "--selection",
                str(selection),
                "--holdout-selection",
                str(holdout_selection),
                "--output-dir",
                str(output),
                "--holdout-release-dir",
                str(release),
            ]
        )
        == 0
    )
    assert (output / "sample.json").is_file()
    assert (output / "protected-references.json").is_file()
    assert len(json.loads((output / "protected-references.json").read_text())["cases"]) == 1
    assert (release / "sealed-holdout.json").is_file()
    assert (release / "protected-references.json").is_file()
    assert (release / "release-ledger.json").is_file()


def test_merge_requires_holdout_identities_to_live_only_in_vault_selection() -> None:
    open_selection = {
        "schema": "lexicography-selection-v1",
        "benchmarkId": "test",
        "reservedHoldoutCaseCount": 1,
        "lemmas": [{"headword": "bank", "split": "development"}],
    }
    holdout = {
        "schema": "lexicography-selection-v1",
        "benchmarkId": "test",
        "lemmas": [{"headword": "huis", "split": "holdout"}],
    }
    merged = _merge_open_and_holdout_selections(open_selection, holdout)
    assert [item["headword"] for item in merged["lemmas"]] == ["bank", "huis"]

    leaked = json.loads(json.dumps(open_selection))
    leaked["lemmas"].append({"headword": "huis", "split": "holdout"})
    with pytest.raises(ValueError, match="must not expose"):
        _merge_open_and_holdout_selections(leaked, holdout)


def test_cli_refuses_sealed_holdout_without_stateful_run_binding(tmp_path: Path) -> None:
    sealed = tmp_path / "sealed.json"
    sealed.write_text(
        json.dumps(
            {
                "schema": "lexicography-sample-v1",
                "sealed": True,
                "cases": [],
            }
        ),
        encoding="utf-8",
    )
    prompt = tmp_path / "prompt.json"
    prompt.write_text(
        json.dumps(
            {
                "schema": "lexicography-prompt-v1",
                "promptId": "test",
                "systemText": "test",
                "userInstructions": "test",
            }
        ),
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="ledger, run ID, frozen prompt"):
        main(
            [
                "--repo-root",
                str(tmp_path),
                "generate",
                "--sample",
                str(sealed),
                "--prompt",
                str(prompt),
                "--run-dir",
                str(
                    tmp_path
                    / "reports"
                    / "generated"
                    / "lexicography-eval"
                    / "run"
                ),
                "--split",
                "holdout",
                "--max-requests",
                "1",
            ]
        )


def test_holdout_ledger_binds_exactly_one_run_id(tmp_path: Path) -> None:
    sample_path = tmp_path / "sealed-holdout.json"
    sample_path.write_text(
        json.dumps(
            {
                "schema": "lexicography-sample-v1",
                "benchmarkId": "sealed-test",
                "sealed": True,
                "cases": [],
            },
            sort_keys=True,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    import hashlib

    ledger_path = tmp_path / "release-ledger.json"
    ledger_path.write_text(
        json.dumps(
            {
                "schema": "lexicography-holdout-release-ledger-v1",
                "benchmarkId": "sealed-test",
                "sampleSha256": hashlib.sha256(sample_path.read_bytes()).hexdigest(),
            }
        ),
        encoding="utf-8",
    )
    sample = json.loads(sample_path.read_text(encoding="utf-8"))

    _require_holdout_binding(
        sample_path=sample_path,
        sample=sample,
        ledger_path=ledger_path,
        run_id="finalist-b-v1",
        prompt_id="finalist-b",
        prompt_hash="prompt-hash-b",
        generation_run_dir=tmp_path / "generation-finalist-b",
    )
    binding = json.loads((tmp_path / "run-binding.json").read_text())
    assert binding["runId"] == "finalist-b-v1"

    _require_holdout_binding(
        sample_path=sample_path,
        sample=sample,
        ledger_path=ledger_path,
        run_id="finalist-b-v1",
        prompt_id="finalist-b",
        prompt_hash="prompt-hash-b",
        generation_run_dir=tmp_path / "generation-finalist-b",
    )
    with pytest.raises(ValueError, match="already bound"):
        _require_holdout_binding(
            sample_path=sample_path,
            sample=sample,
            ledger_path=ledger_path,
            run_id="different-run",
            prompt_id="finalist-b",
            prompt_hash="prompt-hash-b",
            generation_run_dir=tmp_path / "generation-finalist-b",
        )
    with pytest.raises(ValueError, match="already bound"):
        _require_holdout_binding(
            sample_path=sample_path,
            sample=sample,
            ledger_path=ledger_path,
            run_id="finalist-b-v1",
            prompt_id="different-prompt",
            prompt_hash="different-hash",
            generation_run_dir=tmp_path / "generation-finalist-b",
        )


def test_split_is_filtered_before_limit() -> None:
    sample = {
        "cases": [
            {"caseId": "d1", "split": "development", "referenceIds": ["1"]},
            {"caseId": "v1", "split": "validation", "referenceIds": ["2"]},
            {"caseId": "v2", "split": "validation", "referenceIds": ["3", "4"]},
        ]
    }

    result = _sample_for_split(sample, "validation", 1)

    assert [case["caseId"] for case in result["cases"]] == ["v1"]
    assert result["caseCount"] == 1
    assert result["meaningCount"] == 1
