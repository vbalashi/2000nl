from __future__ import annotations

from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Callable, Iterator

from .comparison import plateau_reached


LEDGER_SCHEMA = "lexicography-tournament-ledger-v2"
FINALIST_KEYS = {"promptId", "promptHash", "model"}


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return value


def _file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_tournament_ledger_path(
    *, output_root: Path, benchmark_id: str, selection_hash: str
) -> Path:
    allowed = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-"
    if (
        not benchmark_id
        or any(character not in allowed for character in benchmark_id)
        or len(selection_hash) != 64
        or any(character not in "0123456789abcdef" for character in selection_hash)
    ):
        raise ValueError("Tournament comparison has invalid benchmark identity")
    return output_root / benchmark_id / f"tournament-{selection_hash}.json"


def _finalist(value: Any) -> dict[str, str]:
    if (
        not isinstance(value, dict)
        or set(value) != FINALIST_KEYS
        or not all(isinstance(item, str) and item for item in value.values())
        or len(value["promptHash"]) != 64
    ):
        raise ValueError("Tournament comparison has an invalid finalist identity")
    return value


def _winner(round_value: dict[str, Any]) -> dict[str, str]:
    return (
        round_value["challenger"]
        if round_value["decision"] == "promote"
        else round_value["incumbent"]
    )


def _validated_state(ledger: dict[str, Any]) -> dict[str, Any]:
    expected_keys = {
        "schema", "benchmarkId", "selectionHash", "rounds", "currentWinner",
        "validationFinalists", "finalist",
    }
    if set(ledger) != expected_keys or ledger.get("schema") != LEDGER_SCHEMA:
        raise ValueError("Tournament ledger uses an unsupported schema")
    rounds = ledger.get("rounds")
    if not isinstance(rounds, list):
        raise ValueError("Tournament ledger rounds must be an array")
    required = {"phase", "incumbent", "challenger", "decision", "comparisonSha256"}
    current_winner = None
    frozen_pair = None
    selected_finalist = None
    development_decisions: list[bool] = []
    validation_seen = False
    comparison_hashes: set[str] = set()
    seen_participants: list[dict[str, str]] = []
    for item in rounds:
        if (
            not isinstance(item, dict)
            or set(item) != required
            or item.get("phase") not in {"development", "validation"}
            or item.get("decision") not in {"promote", "reject"}
            or not isinstance(item.get("comparisonSha256"), str)
            or len(item["comparisonSha256"]) != 64
        ):
            raise ValueError("Tournament ledger rounds use an unsupported shape")
        if item["comparisonSha256"] in comparison_hashes:
            raise ValueError("Tournament ledger repeats a comparison artifact")
        comparison_hashes.add(item["comparisonSha256"])
        incumbent = _finalist(item["incumbent"])
        challenger = _finalist(item["challenger"])
        if item["phase"] == "development":
            if not seen_participants:
                seen_participants.append(incumbent)
            if challenger in seen_participants:
                raise ValueError("Tournament ledger repeats a participant as challenger")
            seen_participants.append(challenger)
            if validation_seen or frozen_pair is not None:
                raise ValueError("Tournament ledger contains development after its stopping rule")
            if current_winner is not None and incumbent != current_winner:
                raise ValueError("Tournament ledger breaks the incumbent winner chain")
            current_winner = _winner(item)
            development_decisions.append(item["decision"] == "promote")
            if plateau_reached(development_decisions):
                frozen_pair = [incumbent, challenger]
        else:
            if validation_seen or frozen_pair is None:
                raise ValueError("Tournament ledger has an invalid validation round")
            if [incumbent, challenger] != frozen_pair:
                raise ValueError("Validation must compare the frozen development finalists")
            validation_seen = True
            selected_finalist = _winner(item)
    if ledger.get("currentWinner") != current_winner:
        raise ValueError("Tournament ledger current winner is inconsistent")
    if ledger.get("validationFinalists") != frozen_pair:
        raise ValueError("Tournament ledger validation finalists are inconsistent")
    if ledger.get("finalist") != selected_finalist:
        raise ValueError("Tournament ledger selected finalist is inconsistent")
    return {
        "rounds": rounds,
        "currentWinner": current_winner,
        "validationFinalists": frozen_pair,
        "validationSeen": validation_seen,
        "developmentDecisions": development_decisions,
        "seenParticipants": seen_participants,
    }


def validated_tournament_release(ledger_path: Path) -> dict[str, Any]:
    ledger = _read_json(ledger_path)
    state = _validated_state(ledger)
    if not state["validationSeen"] or ledger.get("finalist") is None:
        raise ValueError("Tournament ledger has no selected validation finalist")
    validation_round = state["rounds"][-1]
    return {
        "benchmarkId": ledger.get("benchmarkId"),
        "selectionHash": ledger.get("selectionHash"),
        "finalist": ledger["finalist"],
        "validationComparisonSha256": validation_round["comparisonSha256"],
        "tournamentLedgerSha256": _file_sha256(ledger_path),
    }


@contextmanager
def tournament_round(
    *, ledger_path: Path, phase: str
) -> Iterator[Callable[[Path], None]]:
    """Serialize and record one connected development or validation comparison."""
    if phase not in {"development", "validation"}:
        raise ValueError("Tournament phase must be development or validation")
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = ledger_path.with_name(f".{ledger_path.name}.lock")
    with lock_path.open("a+", encoding="utf-8") as lock_stream:
        try:
            fcntl.flock(lock_stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("Another tournament comparison is already in progress") from None

        if ledger_path.exists():
            ledger = _read_json(ledger_path)
        else:
            ledger = {
                "schema": LEDGER_SCHEMA,
                "benchmarkId": None,
                "selectionHash": None,
                "rounds": [],
                "currentWinner": None,
                "validationFinalists": None,
                "finalist": None,
            }
        state = _validated_state(ledger)
        if phase == "development" and state["validationFinalists"] is not None:
            raise ValueError("The prompt tournament has reached its stopping rule")
        if phase == "validation":
            if state["validationSeen"]:
                raise ValueError("Validation may compare at most two frozen finalists once")
            if state["validationFinalists"] is None:
                raise ValueError("Validation requires a completed development tournament")

        recorded = False

        def record(comparison_path: Path) -> None:
            nonlocal recorded
            if recorded:
                raise ValueError("Tournament round was already recorded")
            comparison = _read_json(comparison_path)
            if comparison.get("schema") != "lexicography-prompt-comparison-v2":
                raise ValueError("Tournament comparison uses an unsupported schema")
            provenance = comparison.get("evaluationProvenance") or {}
            if provenance.get("split") != phase:
                raise ValueError("Tournament phase does not match comparison provenance")
            binding = {
                "benchmarkId": provenance.get("benchmarkId"),
                "selectionHash": provenance.get("selectionHash"),
            }
            if not all(isinstance(value, str) and value for value in binding.values()):
                raise ValueError("Tournament comparison is missing benchmark provenance")
            existing_binding = {key: ledger.get(key) for key in binding}
            if any(existing_binding.values()) and existing_binding != binding:
                raise ValueError("Tournament ledger is bound to another benchmark selection")
            incumbent = _finalist(comparison.get("incumbentFinalist"))
            challenger = _finalist(comparison.get("challengerFinalist"))
            decision = comparison.get("decision")
            if decision not in {"promote", "reject"}:
                raise ValueError("Tournament comparison has an invalid decision")
            if phase == "development" and state["currentWinner"] is not None:
                if incumbent != state["currentWinner"]:
                    raise ValueError("The next incumbent must be the previous round winner")
            if phase == "development" and (
                challenger in state["seenParticipants"]
            ):
                raise ValueError("Tournament must use a new challenger identity")
            if phase == "validation" and [incumbent, challenger] != state["validationFinalists"]:
                raise ValueError("Validation must compare the frozen development finalists")
            comparison_hash = _file_sha256(comparison_path)
            rounds = state["rounds"]
            if any(item["comparisonSha256"] == comparison_hash for item in rounds):
                raise ValueError("Tournament comparison is already recorded")
            round_value = {
                "phase": phase,
                "incumbent": incumbent,
                "challenger": challenger,
                "decision": decision,
                "comparisonSha256": comparison_hash,
            }
            rounds.append(round_value)
            ledger.update(binding)
            if phase == "development":
                ledger["currentWinner"] = _winner(round_value)
                decisions = state["developmentDecisions"] + [decision == "promote"]
                if plateau_reached(decisions):
                    ledger["validationFinalists"] = [incumbent, challenger]
            else:
                ledger["finalist"] = _winner(round_value)
            rendered = json.dumps(ledger, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
            temporary = ledger_path.with_name(f".{ledger_path.name}.tmp")
            temporary.write_text(rendered, encoding="utf-8")
            os.replace(temporary, ledger_path)
            recorded = True

        yield record
