from __future__ import annotations

import json
from pathlib import Path
import sys


INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))

from lexicography_eval.comparison import (  # noqa: E402
    _load_items,
    _run_binding,
    compare_prompt_runs,
    plateau_reached,
)
from lexicography_eval.artifacts import sha256  # noqa: E402


def _write_judgment(
    root: Path,
    *,
    case_id: str,
    prompt_id: str,
    score: float,
    hard_pass: bool = True,
) -> None:
    items = root / "items"
    items.mkdir(parents=True, exist_ok=True)
    (items / f"{case_id}.json").write_text(
        json.dumps(
            {
                "schema": "lexicography-judgment-v1",
                "caseId": case_id,
                "benchmarkId": "benchmark-v1",
                "selectionHash": "selection-hash",
                "split": "development",
                "promptId": prompt_id,
                "promptHash": f"hash-{prompt_id}",
                "candidateModel": "gpt-4.1",
                "judgeModel": "gpt-4.1",
                "judgeEndpointFingerprint": "azure:test",
                "sourceIndexHash": "source-index-hash",
                "generationRequestHash": ("a" if prompt_id in {"a", "baseline-a"} else "b") * 64,
                "hardPass": hard_pass,
                "articleQualityScore": score,
                "referenceAlignmentScore": score - 0.2,
                "compositeScore": score,
                "errorCodes": [],
            }
        ),
        encoding="utf-8",
    )


def _write_pairwise(
    path: Path,
    *,
    incumbent: Path,
    challenger: Path,
    challenger_win_rate: float = 1.0,
) -> None:
    incumbent_items = _load_items(incumbent)
    challenger_items = _load_items(challenger)
    path.write_text(
        json.dumps(
            {
                "schema": "lexicography-pairwise-aggregate-v1",
                "benchmarkId": "benchmark-v1",
                "selectionHash": "selection-hash",
                "split": "development",
                "caseCount": len(incumbent_items),
                "caseSetHash": sha256(sorted(incumbent_items)),
                "orderedRunBindings": {
                    "candidateOne": _run_binding(incumbent_items),
                    "candidateTwo": _run_binding(challenger_items),
                },
                "rates": {
                    "candidateOneWinRate": round(1 - challenger_win_rate, 4),
                    "candidateTwoWinRate": challenger_win_rate,
                    "tieGoodRate": 0.0,
                    "bothBadRate": 0.0,
                },
                "swappedOrderChecks": {
                    "duplicateCount": 2,
                    "mappedVerdictAgreementRate": 1.0,
                    "sameOpaqueWinnerRate": 0.0,
                },
            }
        ),
        encoding="utf-8",
    )


def test_compare_promotes_only_paired_improvement_without_hard_gate_regression(
    tmp_path: Path,
) -> None:
    incumbent = tmp_path / "incumbent"
    challenger = tmp_path / "challenger"
    for index, (old, new) in enumerate(
        [(3.8, 4.1), (4.0, 4.2), (3.9, 4.3), (4.1, 4.2), (3.7, 4.0)],
        start=1,
    ):
        _write_judgment(
            incumbent,
            case_id=f"case-{index}",
            prompt_id="baseline-a",
            score=old,
        )
        _write_judgment(
            challenger,
            case_id=f"case-{index}",
            prompt_id="challenger-b",
            score=new,
        )

    pairwise = tmp_path / "pairwise.json"
    _write_pairwise(pairwise, incumbent=incumbent, challenger=challenger)
    result = compare_prompt_runs(
        incumbent_dir=incumbent,
        challenger_dir=challenger,
        pairwise_path=pairwise,
        output_path=tmp_path / "comparison.json",
    )

    assert result.promoted is True
    assert result.win_rate == 1.0
    assert result.mean_delta >= 0.1
    saved = json.loads((tmp_path / "comparison.json").read_text(encoding="utf-8"))
    assert saved["schema"] == "lexicography-prompt-comparison-v2"
    assert saved["incumbentFinalist"] == {
        "promptId": "baseline-a",
        "promptHash": "hash-baseline-a",
        "model": "gpt-4.1",
    }
    assert saved["challengerFinalist"] == {
        "promptId": "challenger-b",
        "promptHash": "hash-challenger-b",
        "model": "gpt-4.1",
    }
    assert saved["decision"] == "promote"
    assert "paired" not in saved
    serialized_saved = json.dumps(saved)
    assert "case-1" not in serialized_saved
    assert "incumbentScore" not in serialized_saved
    assert "challengerScore" not in serialized_saved
    assert "protectedReferences" not in json.dumps(saved)
    assert "definition" not in json.dumps(saved).lower()

    _write_judgment(
        challenger,
        case_id="case-1",
        prompt_id="challenger-b",
        score=4.8,
        hard_pass=False,
    )
    rejected = compare_prompt_runs(
        incumbent_dir=incumbent,
        challenger_dir=challenger,
        pairwise_path=pairwise,
        output_path=tmp_path / "rejected.json",
    )
    assert rejected.promoted is False
    assert "hard_gate_regression" in rejected.reasons


def test_compare_refuses_incomparable_evaluation_provenance(tmp_path: Path) -> None:
    incumbent = tmp_path / "incumbent"
    challenger = tmp_path / "challenger"
    _write_judgment(incumbent, case_id="case-1", prompt_id="a", score=4.0)
    _write_judgment(challenger, case_id="case-1", prompt_id="b", score=4.2)
    path = challenger / "items" / "case-1.json"
    value = json.loads(path.read_text())
    value["sourceIndexHash"] = "different-index"
    path.write_text(json.dumps(value), encoding="utf-8")
    pairwise = tmp_path / "pairwise.json"
    _write_pairwise(pairwise, incumbent=incumbent, challenger=challenger)

    try:
        compare_prompt_runs(
            incumbent_dir=incumbent,
            challenger_dir=challenger,
            pairwise_path=pairwise,
            output_path=tmp_path / "comparison.json",
        )
    except ValueError as error:
        assert "provenance" in str(error).lower()
    else:
        raise AssertionError("Incomparable evaluation provenance must be rejected")


def test_compare_rejects_pairwise_position_bias(tmp_path: Path) -> None:
    incumbent = tmp_path / "incumbent"
    challenger = tmp_path / "challenger"
    for index in range(2):
        _write_judgment(
            incumbent, case_id=f"case-{index}", prompt_id="a", score=4.0
        )
        _write_judgment(
            challenger, case_id=f"case-{index}", prompt_id="b", score=4.3
        )
    pairwise = tmp_path / "pairwise.json"
    _write_pairwise(pairwise, incumbent=incumbent, challenger=challenger)
    value = json.loads(pairwise.read_text(encoding="utf-8"))
    value["swappedOrderChecks"] = {
        "duplicateCount": 2,
        "mappedVerdictAgreementRate": 0.0,
        "sameOpaqueWinnerRate": 1.0,
    }
    pairwise.write_text(json.dumps(value), encoding="utf-8")

    result = compare_prompt_runs(
        incumbent_dir=incumbent,
        challenger_dir=challenger,
        pairwise_path=pairwise,
        output_path=tmp_path / "comparison.json",
    )

    assert result.promoted is False
    assert "blind_pairwise_position_bias" in result.reasons


def test_compare_rejects_reversed_pairwise_run_binding(tmp_path: Path) -> None:
    incumbent = tmp_path / "incumbent"
    challenger = tmp_path / "challenger"
    _write_judgment(incumbent, case_id="case-1", prompt_id="a", score=4.0)
    _write_judgment(challenger, case_id="case-1", prompt_id="b", score=4.3)
    pairwise = tmp_path / "pairwise.json"
    _write_pairwise(pairwise, incumbent=challenger, challenger=incumbent)

    try:
        compare_prompt_runs(
            incumbent_dir=incumbent,
            challenger_dir=challenger,
            pairwise_path=pairwise,
            output_path=tmp_path / "comparison.json",
        )
    except ValueError as error:
        assert "ordered runs" in str(error)
    else:
        raise AssertionError("A reversed pairwise artifact must be rejected")


def test_plateau_requires_three_consecutive_non_promotions() -> None:
    assert plateau_reached([True, False, False]) is False
    assert plateau_reached([True, False, False, False]) is True
    assert plateau_reached([True, False, True, False, True, False, True]) is False
    assert plateau_reached([True, False, True, False, True, False, True, False]) is True
