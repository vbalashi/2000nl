#!/usr/bin/env python3
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import os
from pathlib import Path
import sys

import psycopg2


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from importer.source_manifest import (  # noqa: E402
    load_source_manifest,
    stored_raw_fingerprint,
)


def _meaning_id(payload: dict, path: Path) -> int:
    value = payload.get("meaning_id")
    if isinstance(value, int):
        return value
    tail = path.stem.rsplit("_", 1)[-1]
    return int(tail) if tail.isdigit() else 1


def _uuid_set_checksum(values: set[str]) -> str:
    return hashlib.sha256(
        "\n".join(sorted(values)).encode("utf-8")
    ).hexdigest()


def _load_legacy_artifacts(root: Path):
    by_fingerprint = defaultdict(list)
    by_index_sense = defaultdict(list)
    for path in sorted(root.glob("*.json")):
        if path.name.startswith("_"):
            continue
        content = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(content, list) or len(content) != 1:
            continue
        payload = content[0]
        if not isinstance(payload, dict):
            continue
        payload = dict(payload)
        payload.pop("_raw_html", None)
        metadata = payload.get("_metadata") or {}
        source_index = metadata.get("index")
        sense_ordinal = _meaning_id(payload, path)
        item = {
            "artifact_path": path.name,
            "payload": payload,
            "source_index": source_index,
            "sense_ordinal": sense_ordinal,
        }
        by_fingerprint[stored_raw_fingerprint(payload)].append(item)
        by_index_sense[(source_index, sense_ordinal)].append(item)
    return by_fingerprint, by_index_sense


def generate_plan(
    *,
    data_dir: Path,
    legacy_data_dir: Path,
    database_url: str,
    dictionary_slug: str,
    output: Path,
    metadata_fallback_reason: str | None,
) -> Counter:
    manifest = load_source_manifest(data_dir)
    legacy_by_fingerprint, legacy_by_index_sense = _load_legacy_artifacts(
        legacy_data_dir
    )
    new_by_index_sense = defaultdict(list)
    new_by_key = {}
    for artifact in manifest.artifacts:
        new_by_index_sense[
            (artifact.source_index, artifact.sense_ordinal)
        ].append(artifact)
        new_by_key[artifact.source_entry_key] = artifact

    connection = psycopg2.connect(database_url)
    connection.set_session(readonly=True)
    with connection, connection.cursor() as cursor:
        cursor.execute(
            """
            select entry.id::text, entry.headword, entry.meaning_id,
                   entry.vandale_id, entry.raw
            from public.word_entries as entry
            join public.dictionaries as dictionary
              on dictionary.id = entry.dictionary_id
            where dictionary.slug = %s
            order by entry.id
            """,
            (dictionary_slug,),
        )
        existing_rows = cursor.fetchall()

    stats = Counter(existing_rows=len(existing_rows))
    decisions_by_key = {}
    assigned_existing_ids = set()
    fallback_rows = []
    ambiguities = []

    for word_entry_id, headword, meaning_id, vandale_id, raw in existing_rows:
        raw_fingerprint = stored_raw_fingerprint(raw)
        legacy_matches = legacy_by_fingerprint.get(raw_fingerprint, [])
        method = None
        reason = None
        if len(legacy_matches) == 1:
            legacy = legacy_matches[0]
            source_index = legacy["source_index"]
            sense_ordinal = legacy["sense_ordinal"]
            method = "legacy-payload-exact"
            reason = "Unique canonical match to the legacy imported payload."
            stats["legacy_payload_exact"] += 1
        elif len(legacy_matches) > 1:
            ambiguities.append(
                {
                    "word_entry_id": word_entry_id,
                    "reason": "multiple-legacy-payload-matches",
                }
            )
            continue
        else:
            source_index = vandale_id
            sense_ordinal = meaning_id
            legacy_index_matches = legacy_by_index_sense.get(
                (source_index, sense_ordinal),
                [],
            )
            if legacy_index_matches:
                ambiguities.append(
                    {
                        "word_entry_id": word_entry_id,
                        "reason": "legacy-index-candidate-with-content-mismatch",
                    }
                )
                continue
            if metadata_fallback_reason is None:
                fallback_rows.append(
                    {
                        "word_entry_id": word_entry_id,
                        "headword": headword,
                        "source_index": source_index,
                        "sense_ordinal": sense_ordinal,
                        "expected_raw_fingerprint": raw_fingerprint,
                    }
                )
                continue
            method = "approved-metadata-index-semantic-review"
            reason = metadata_fallback_reason
            stats["approved_metadata_fallback"] += 1

        targets = new_by_index_sense.get(
            (source_index, sense_ordinal),
            [],
        )
        if len(targets) != 1:
            ambiguities.append(
                {
                    "word_entry_id": word_entry_id,
                    "reason": "new-target-not-unique",
                    "target_count": len(targets),
                }
            )
            continue
        target = targets[0]
        if target.source_entry_key in decisions_by_key:
            ambiguities.append(
                {
                    "word_entry_id": word_entry_id,
                    "reason": "source-key-competes-for-existing-uuid",
                    "source_entry_key": target.source_entry_key,
                }
            )
            continue
        if (raw.get("headword") or headword).strip() != (
            target.payload.get("headword") or ""
        ).strip():
            ambiguities.append(
                {
                    "word_entry_id": word_entry_id,
                    "reason": "headword-mismatch",
                    "source_entry_key": target.source_entry_key,
                }
            )
            continue

        decisions_by_key[target.source_entry_key] = {
            "source_entry_key": target.source_entry_key,
            "action": "bind-existing",
            "word_entry_id": word_entry_id,
            "expected_raw_fingerprint": raw_fingerprint,
            "method": method,
            "reason": reason,
        }
        assigned_existing_ids.add(word_entry_id)

    if fallback_rows and metadata_fallback_reason is None:
        raise RuntimeError(
            "Metadata-only candidates require explicit semantic review: "
            + json.dumps(fallback_rows, ensure_ascii=False)
        )
    if ambiguities:
        raise RuntimeError(
            "Ambiguous reconciliation candidates: "
            + json.dumps(ambiguities, ensure_ascii=False)
        )
    existing_ids = {row[0] for row in existing_rows}
    if assigned_existing_ids != existing_ids:
        missing = sorted(existing_ids - assigned_existing_ids)
        raise RuntimeError(
            f"Reconciliation did not account for existing UUIDs: {missing}"
        )

    for source_entry_key, artifact in sorted(new_by_key.items()):
        if source_entry_key in decisions_by_key:
            continue
        decisions_by_key[source_entry_key] = {
            "source_entry_key": source_entry_key,
            "action": "insert-new",
            "word_entry_id": None,
            "expected_raw_fingerprint": None,
            "method": "approved-restored-source-artifact",
            "reason": (
                "The source artifact has no historical UUID after complete "
                "legacy reconciliation; restore it as a new source row."
            ),
        }
        stats["insert_new"] += 1

    if set(decisions_by_key) != set(new_by_key):
        raise RuntimeError("Plan does not cover every manifest artifact")

    plan = {
        "format_version": "source-reconciliation-plan-v1",
        "manifest_sha256": manifest.manifest_sha256,
        "identity_scheme_version": manifest.identity_scheme_version,
        "dictionary_slug": dictionary_slug,
        "existing_uuid_set_sha256": _uuid_set_checksum(existing_ids),
        "decisions": [
            decisions_by_key[key] for key in sorted(decisions_by_key)
        ],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(plan, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    stats["decisions"] = len(decisions_by_key)
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Generate a read-only first-binding plan for a source manifest."
        )
    )
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--legacy-data-dir", type=Path, required=True)
    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL"),
    )
    parser.add_argument("--dictionary-slug", default="nl-vandale")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--approve-metadata-fallback-reason",
        help=(
            "Explicit review reason for legacy rows whose overwritten artifact "
            "can only be matched by source index/sense after semantic review."
        ),
    )
    arguments = parser.parse_args()
    if not arguments.database_url:
        parser.error("--database-url or DATABASE_URL is required")

    stats = generate_plan(
        data_dir=arguments.data_dir,
        legacy_data_dir=arguments.legacy_data_dir,
        database_url=arguments.database_url,
        dictionary_slug=arguments.dictionary_slug,
        output=arguments.output,
        metadata_fallback_reason=(
            arguments.approve_metadata_fallback_reason
        ),
    )
    print(json.dumps(stats, sort_keys=True))


if __name__ == "__main__":
    main()
