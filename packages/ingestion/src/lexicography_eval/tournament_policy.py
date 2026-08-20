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
    if (
        not benchmark_id
        or any(character not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for character in benchmark_id)
        or len(selection_hash) != 64
        or any(character not in "0123456789abcdef" for character in selection_hash)
    ):
        raise ValueError("Tournament comparison has invalid benchmark identity")
    return output_root / benchmark_id / f"tournament-{selection_hash}.json"


def _validate_rounds(rounds: Any) -> list[dict[str, Any]]:
    if not isinstance(rounds, list):
        raise ValueError("Tournament ledger rounds must be an array")
    required = {
        "phase", "incumbent", "challenger", "decision", "comparisonSha256"
    }
    if any(not isinstance(item, dict) or set(item) != required for item in rounds):
        raise ValueError("Tournament ledger rounds use an unsupported shape")
    return rounds


@contextmanager
def tournament_round(
    *, ledger_path: Path, phase: str
) -> Iterator[Callable[[Path], None]]:
    """Serialize and record one bounded development or validation comparison."""
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
            if ledger.get("schema") != LEDGER_SCHEMA:
                raise ValueError("Tournament ledger uses an unsupported schema")
            rounds = _validate_rounds(ledger.get("rounds"))
        else:
            ledger = {
                "schema": LEDGER_SCHEMA,
                "benchmarkId": None,
                "selectionHash": None,
                "rounds": [],
                "finalist": None,
            }
            rounds = ledger["rounds"]

        development_rounds = [item for item in rounds if item["phase"] == "development"]
        validation_rounds = [item for item in rounds if item["phase"] == "validation"]
        if phase == "development":
            if validation_rounds:
                raise ValueError("Development is closed after the validation comparison")
            if plateau_reached(
                [item["decision"] == "promote" for item in development_rounds]
            ):
                raise ValueError("The prompt tournament has reached its stopping rule")
        else:
            if validation_rounds:
                raise ValueError("Validation may compare at most two frozen finalists once")
            if not development_rounds or not plateau_reached(
                [item["decision"] == "promote" for item in development_rounds]
            ):
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
            incumbent = comparison.get("incumbentFinalist")
            challenger = comparison.get("challengerFinalist")
            if not isinstance(incumbent, dict) or not isinstance(challenger, dict):
                raise ValueError("Tournament comparison is missing frozen finalist identities")
            decision = comparison.get("decision")
            if decision not in {"promote", "reject"}:
                raise ValueError("Tournament comparison has an invalid decision")
            comparison_hash = _file_sha256(comparison_path)
            if any(item["comparisonSha256"] == comparison_hash for item in rounds):
                raise ValueError("Tournament comparison is already recorded")
            ledger.update(binding)
            rounds.append({
                "phase": phase,
                "incumbent": incumbent,
                "challenger": challenger,
                "decision": decision,
                "comparisonSha256": comparison_hash,
            })
            if phase == "validation":
                ledger["finalist"] = challenger if decision == "promote" else incumbent
            rendered = json.dumps(ledger, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
            temporary = ledger_path.with_name(f".{ledger_path.name}.tmp")
            temporary.write_text(rendered, encoding="utf-8")
            os.replace(temporary, ledger_path)
            recorded = True

        yield record
