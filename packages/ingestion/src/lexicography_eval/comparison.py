from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import random
from typing import Any, Iterable

from .artifacts import sha256, write_json as _write_json


@dataclass(frozen=True)
class ComparisonResult:
    promoted: bool
    mean_delta: float
    win_rate: float
    hard_pass_delta: float
    reasons: tuple[str, ...]
    confidence_interval: tuple[float, float]


def _load_items(root: Path) -> dict[str, dict[str, Any]]:
    item_dir = root / "items"
    if not item_dir.is_dir():
        raise ValueError(f"Judgment item directory is missing: {item_dir}")
    result = {}
    for path in sorted(item_dir.glob("*.json"), key=lambda item: item.name):
        value = json.loads(path.read_text(encoding="utf-8"))
        if value.get("schema") != "lexicography-judgment-v1":
            raise ValueError(f"Unsupported judgment schema: {path}")
        case_id = str(value.get("caseId") or "")
        if not case_id or case_id in result:
            raise ValueError(f"Invalid or duplicate judgment case: {path}")
        result[case_id] = value
    if not result:
        raise ValueError(f"No judgment items found in {item_dir}")
    return result


def _prompt_id(items: dict[str, dict[str, Any]]) -> str:
    values = {str(item.get("promptId") or "") for item in items.values()}
    if len(values) != 1 or not next(iter(values)):
        raise ValueError("Every compared run must have one promptId")
    return next(iter(values))


def _run_binding(items: dict[str, dict[str, Any]]) -> str:
    first = items[sorted(items)[0]]
    records = []
    for case_id in sorted(items):
        item = items[case_id]
        request_hash = item.get("generationRequestHash")
        if not isinstance(request_hash, str) or not request_hash:
            raise ValueError("Compared judgment is missing generation request provenance")
        records.append(
            {
                "caseId": case_id,
                "promptId": item.get("promptId"),
                "promptHash": item.get("promptHash"),
                "model": item.get("candidateModel"),
                "generationRequestHash": request_hash,
            }
        )
    return sha256(
        {
            "benchmarkId": first.get("benchmarkId"),
            "selectionHash": first.get("selectionHash"),
            "candidates": records,
        }
    )


def _load_pairwise(
    path: Path,
    *,
    expected_case_count: int,
    benchmark_id: str,
    selection_hash: str,
    split: str,
    case_set_hash: str,
    candidate_one_binding: str,
    candidate_two_binding: str,
) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if value.get("schema") != "lexicography-pairwise-aggregate-v1":
        raise ValueError("Pairwise comparison uses an unsupported schema")
    if value.get("caseCount") != expected_case_count:
        raise ValueError("Pairwise comparison case count does not match judged runs")
    expected_binding = {
        "benchmarkId": benchmark_id,
        "selectionHash": selection_hash,
        "split": split,
        "caseSetHash": case_set_hash,
        "orderedRunBindings": {
            "candidateOne": candidate_one_binding,
            "candidateTwo": candidate_two_binding,
        },
    }
    if {key: value.get(key) for key in expected_binding} != expected_binding:
        raise ValueError("Pairwise comparison is not bound to these ordered runs")
    rates = value.get("rates")
    checks = value.get("swappedOrderChecks")
    if not isinstance(rates, dict) or not isinstance(checks, dict):
        raise ValueError("Pairwise comparison is missing aggregate rates")
    for field in (
        "candidateOneWinRate",
        "candidateTwoWinRate",
        "tieGoodRate",
        "bothBadRate",
    ):
        rate = rates.get(field)
        if (
            not isinstance(rate, (int, float))
            or isinstance(rate, bool)
            or not 0 <= rate <= 1
        ):
            raise ValueError(f"Pairwise comparison has invalid {field}")
    return value


COMPARABILITY_FIELDS = (
    "benchmarkId",
    "selectionHash",
    "split",
    "candidateModel",
    "judgeModel",
    "judgeEndpointFingerprint",
    "sourceIndexHash",
)


def _provenance(items: dict[str, dict[str, Any]]) -> dict[str, str]:
    result = {}
    for field in COMPARABILITY_FIELDS:
        values = {str(item.get(field) or "") for item in items.values()}
        if len(values) != 1 or not next(iter(values)):
            raise ValueError(f"Every compared run must have one non-empty {field}")
        result[field] = next(iter(values))
    return result


def _bootstrap_interval(
    deltas: list[float],
    *,
    seed_text: str,
    samples: int = 5000,
) -> tuple[float, float]:
    if len(deltas) == 1:
        value = round(deltas[0], 4)
        return value, value
    seed = int(hashlib.sha256(seed_text.encode("utf-8")).hexdigest()[:16], 16)
    rng = random.Random(seed)
    means = []
    for _ in range(samples):
        draw = [deltas[rng.randrange(len(deltas))] for _ in deltas]
        means.append(sum(draw) / len(draw))
    means.sort()
    low = means[int(samples * 0.025)]
    high = means[min(samples - 1, int(samples * 0.975))]
    return round(low, 4), round(high, 4)


def compare_prompt_runs(
    *,
    incumbent_dir: Path,
    challenger_dir: Path,
    pairwise_path: Path,
    output_path: Path,
    minimum_delta: float = 0.10,
    minimum_win_rate: float = 0.60,
) -> ComparisonResult:
    incumbent = _load_items(incumbent_dir)
    challenger = _load_items(challenger_dir)
    if set(incumbent) != set(challenger):
        raise ValueError("Compared runs must contain exactly the same case IDs")

    case_ids = sorted(incumbent)
    incumbent_prompt = _prompt_id(incumbent)
    challenger_prompt = _prompt_id(challenger)
    incumbent_provenance = _provenance(incumbent)
    challenger_provenance = _provenance(challenger)
    if incumbent_provenance != challenger_provenance:
        raise ValueError("Compared runs have incompatible evaluation provenance")
    deltas = [
        float(challenger[case_id]["articleQualityScore"])
        - float(incumbent[case_id]["articleQualityScore"])
        for case_id in case_ids
    ]
    alignment_deltas = [
        float(challenger[case_id]["referenceAlignmentScore"])
        - float(incumbent[case_id]["referenceAlignmentScore"])
        for case_id in case_ids
    ]
    mean_delta = round(sum(deltas) / len(deltas), 4)
    pairwise = _load_pairwise(
        pairwise_path,
        expected_case_count=len(case_ids),
        benchmark_id=incumbent_provenance["benchmarkId"],
        selection_hash=incumbent_provenance["selectionHash"],
        split=incumbent_provenance["split"],
        case_set_hash=sha256(case_ids),
        candidate_one_binding=_run_binding(incumbent),
        candidate_two_binding=_run_binding(challenger),
    )
    win_rate = float(pairwise["rates"]["candidateTwoWinRate"])
    incumbent_hard_rate = sum(
        bool(incumbent[case_id].get("hardPass")) for case_id in case_ids
    ) / len(case_ids)
    challenger_hard_rate = sum(
        bool(challenger[case_id].get("hardPass")) for case_id in case_ids
    ) / len(case_ids)
    hard_pass_delta = round(challenger_hard_rate - incumbent_hard_rate, 4)
    reasons = []
    if hard_pass_delta < 0:
        reasons.append("hard_gate_regression")
    if mean_delta < minimum_delta:
        reasons.append("paired_delta_below_threshold")
    if win_rate < minimum_win_rate:
        reasons.append("blind_pairwise_win_rate_below_threshold")
    swapped = pairwise["swappedOrderChecks"]
    duplicate_count = int(swapped.get("duplicateCount") or 0)
    mapped_agreement = float(swapped.get("mappedVerdictAgreementRate") or 0)
    same_opaque_winner = float(swapped.get("sameOpaqueWinnerRate") or 0)
    if duplicate_count and (mapped_agreement < 0.5 or same_opaque_winner > 0.75):
        reasons.append("blind_pairwise_position_bias")
    promoted = not reasons
    interval = _bootstrap_interval(
        deltas,
        seed_text="|".join(case_ids + [incumbent_prompt, challenger_prompt]),
    )

    value = {
        "schema": "lexicography-prompt-comparison-v2",
        "incumbentPromptId": incumbent_prompt,
        "challengerPromptId": challenger_prompt,
        "caseCount": len(case_ids),
        "evaluationProvenance": incumbent_provenance,
        "decision": "promote" if promoted else "reject",
        "reasons": reasons,
        "thresholds": {
            "minimumMeanDelta": minimum_delta,
            "minimumWinRate": minimum_win_rate,
            "minimumHardPassDelta": 0,
        },
        "metrics": {
            "meanPairedDelta": mean_delta,
            "meanReferenceAlignmentDelta": round(
                sum(alignment_deltas) / len(alignment_deltas), 4
            ),
            "pairedDeltaBootstrap95": list(interval),
            "winRate": win_rate,
            "incumbentHardPassRate": round(incumbent_hard_rate, 4),
            "challengerHardPassRate": round(challenger_hard_rate, 4),
            "hardPassDelta": hard_pass_delta,
            "blindPairwise": {
                "challengerWinRate": win_rate,
                "incumbentWinRate": pairwise["rates"]["candidateOneWinRate"],
                "tieGoodRate": pairwise["rates"]["tieGoodRate"],
                "bothBadRate": pairwise["rates"]["bothBadRate"],
                "swappedDuplicateCount": duplicate_count,
                "mappedVerdictAgreementRate": mapped_agreement,
                "sameOpaqueWinnerRate": same_opaque_winner,
            },
        },
    }
    _write_json(output_path, value)
    return ComparisonResult(
        promoted=promoted,
        mean_delta=mean_delta,
        win_rate=win_rate,
        hard_pass_delta=hard_pass_delta,
        reasons=tuple(reasons),
        confidence_interval=interval,
    )


def plateau_reached(
    promotions: Iterable[bool], *, required_failures: int = 3, max_challengers: int = 8
) -> bool:
    values = list(promotions)
    if required_failures < 1:
        raise ValueError("required_failures must be positive")
    if max_challengers < 1:
        raise ValueError("max_challengers must be positive")
    return len(values) >= max_challengers or (
        len(values) >= required_failures and not any(values[-required_failures:])
    )
