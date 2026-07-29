from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Optional
from uuid import UUID


PLAN_FORMAT_VERSION = "source-reconciliation-plan-v1"


@dataclass(frozen=True)
class ReconciliationDecision:
    source_entry_key: str
    action: str
    word_entry_id: Optional[str]
    expected_raw_fingerprint: Optional[str]
    method: str
    reason: str


@dataclass(frozen=True)
class ReconciliationPlan:
    path: Path
    manifest_sha256: str
    identity_scheme_version: str
    dictionary_slug: str
    existing_uuid_set_sha256: str
    decisions: dict[str, ReconciliationDecision]


def load_reconciliation_plan(
    path: Path | str,
    *,
    manifest_sha256: str,
    identity_scheme_version: str,
    dictionary_slug: str,
    source_entry_keys: set[str],
) -> ReconciliationPlan:
    plan_path = Path(path)
    payload = json.loads(plan_path.read_text(encoding="utf-8"))
    if payload.get("format_version") != PLAN_FORMAT_VERSION:
        raise ValueError("unsupported reconciliation plan format")
    if payload.get("manifest_sha256") != manifest_sha256:
        raise ValueError("reconciliation plan manifest mismatch")
    if payload.get("identity_scheme_version") != identity_scheme_version:
        raise ValueError("reconciliation plan identity scheme mismatch")
    if payload.get("dictionary_slug") != dictionary_slug:
        raise ValueError("reconciliation plan dictionary mismatch")

    decisions = {}
    assigned_existing_ids = set()
    for raw_decision in payload.get("decisions") or []:
        source_entry_key = raw_decision.get("source_entry_key")
        if not isinstance(source_entry_key, str) or not source_entry_key:
            raise ValueError("reconciliation decision missing source entry key")
        if source_entry_key in decisions:
            raise ValueError(
                f"duplicate reconciliation decision: {source_entry_key}"
            )

        action = raw_decision.get("action")
        if action not in {"bind-existing", "insert-new"}:
            raise ValueError(f"unsupported reconciliation action: {action}")
        reason = raw_decision.get("reason")
        method = raw_decision.get("method")
        if not isinstance(reason, str) or not reason.strip():
            raise ValueError(f"{source_entry_key} is missing an approval reason")
        if not isinstance(method, str) or not method.strip():
            raise ValueError(f"{source_entry_key} is missing a decision method")

        word_entry_id = raw_decision.get("word_entry_id")
        expected_raw_fingerprint = raw_decision.get(
            "expected_raw_fingerprint"
        )
        if action == "bind-existing":
            try:
                normalized_word_entry_id = str(UUID(str(word_entry_id)))
            except (ValueError, TypeError, AttributeError) as error:
                raise ValueError(
                    f"{source_entry_key} has an invalid existing UUID"
                ) from error
            if normalized_word_entry_id in assigned_existing_ids:
                raise ValueError(
                    f"existing UUID assigned more than once: "
                    f"{normalized_word_entry_id}"
                )
            assigned_existing_ids.add(normalized_word_entry_id)
            if (
                not isinstance(expected_raw_fingerprint, str)
                or len(expected_raw_fingerprint) != 64
            ):
                raise ValueError(
                    f"{source_entry_key} has no stored-content fingerprint"
                )
            word_entry_id = normalized_word_entry_id
        else:
            if word_entry_id is not None or expected_raw_fingerprint is not None:
                raise ValueError(
                    f"{source_entry_key} insert-new decision has legacy identity"
                )

        decisions[source_entry_key] = ReconciliationDecision(
            source_entry_key=source_entry_key,
            action=action,
            word_entry_id=word_entry_id,
            expected_raw_fingerprint=expected_raw_fingerprint,
            method=method,
            reason=reason.strip(),
        )

    if set(decisions) != source_entry_keys:
        raise ValueError("reconciliation decision set does not match manifest")

    existing_uuid_set_sha256 = payload.get("existing_uuid_set_sha256")
    if (
        not isinstance(existing_uuid_set_sha256, str)
        or len(existing_uuid_set_sha256) != 64
    ):
        raise ValueError("reconciliation plan missing existing UUID set checksum")

    return ReconciliationPlan(
        path=plan_path.resolve(),
        manifest_sha256=manifest_sha256,
        identity_scheme_version=identity_scheme_version,
        dictionary_slug=dictionary_slug,
        existing_uuid_set_sha256=existing_uuid_set_sha256,
        decisions=decisions,
    )
