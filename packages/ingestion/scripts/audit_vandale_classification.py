#!/usr/bin/env python3
"""Dry-run Van Dale source classification against versioned artifacts."""

from __future__ import annotations

import argparse
from collections import Counter
from copy import deepcopy
import json
from pathlib import Path
import sys
from typing import Any

from bs4 import BeautifulSoup


INGESTION_ROOT = Path(__file__).resolve().parents[1]
PACKAGES_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))
sys.path.insert(0, str(PACKAGES_ROOT / "scraper"))

from importer.source_manifest import (  # noqa: E402
    load_source_manifest,
    platform_v2_content_node_inputs,
    semantic_content_fingerprint,
    stored_raw_fingerprint,
)
from vandale_html_parser import (  # noqa: E402
    is_vandale_meaning_example_block,
    parse_vandale_entry_fixed,
)


REPORT_FORMAT_VERSION = "vandale-classification-audit-v1"


def _clean_label(value: str) -> str:
    return " ".join((value or "").lower().split())


def _source_shape_census(raw_html: str) -> tuple[Counter, Counter]:
    counts = Counter(
        {
            "bareNonVoorbeeldenBlocks": 0,
            "bareVoorbeeldenBlocks": 0,
            "blocksWithExplanation": 0,
            "blocksWithNestedExamples": 0,
            "blocksWithoutExpression": 0,
            "totalF0cBlocks": 0,
        }
    )
    variants = Counter()
    soup = BeautifulSoup(raw_html or "", "html.parser")
    for meaning_block in soup.find_all("span", class_="f3u"):
        for block in meaning_block.find_all("span", class_="f0c"):
            expressions = block.find_all("span", class_="f3i")
            explanations = block.find_all("span", class_="f3n")
            examples = block.find_all("span", class_="f2s")
            section_link = block.find_previous_sibling("a", class_="f0h")
            section_label = _clean_label(
                section_link.get_text(" ", strip=True)
                if section_link is not None
                else ""
            )
            counts["totalF0cBlocks"] += 1
            counts["blocksWithExplanation"] += bool(explanations)
            counts["blocksWithNestedExamples"] += bool(examples)
            counts["blocksWithoutExpression"] += not bool(expressions)
            if is_vandale_meaning_example_block(block):
                counts["bareVoorbeeldenBlocks"] += 1
            elif bool(expressions) and not explanations and not examples:
                counts["bareNonVoorbeeldenBlocks"] += 1
            variants[
                (
                    len(expressions),
                    len(explanations),
                    len(examples),
                    section_label,
                )
            ] += 1
    return counts, variants


def _node_view(node: dict[str, str]) -> dict[str, str]:
    fields = (
        "inputKey",
        "kind",
        "sourcePath",
        "sourceText",
        "sourceTextFingerprint",
        "parentInputKey",
    )
    return {field: node[field] for field in fields if field in node}


def _node_signature(node: dict[str, str]) -> tuple[str, ...]:
    return (
        node.get("inputKey", ""),
        node.get("kind", ""),
        node.get("sourcePath", ""),
        node.get("sourceText", ""),
        node.get("sourceTextFingerprint", ""),
        node.get("parentInputKey", ""),
    )


def _node_diff(
    before_payload: dict[str, Any],
    after_payload: dict[str, Any],
) -> dict[str, list[dict[str, Any]]]:
    before_nodes = platform_v2_content_node_inputs(before_payload)
    after_nodes = platform_v2_content_node_inputs(after_payload)
    after_signatures = Counter(_node_signature(node) for node in after_nodes)
    unchanged = []
    removed = []
    for node in before_nodes:
        signature = _node_signature(node)
        if after_signatures[signature]:
            after_signatures[signature] -= 1
            unchanged.append(_node_view(node))
        else:
            removed.append(node)

    remaining_added = []
    for node in after_nodes:
        signature = _node_signature(node)
        if after_signatures[signature]:
            after_signatures[signature] -= 1
            remaining_added.append(node)

    remapped = []
    unmapped_removed = []
    used_added_indexes: set[int] = set()
    for before_node in removed:
        candidates = [
            index
            for index, after_node in enumerate(remaining_added)
            if index not in used_added_indexes
            and after_node.get("sourceText") == before_node.get("sourceText")
        ]
        if len(candidates) != 1:
            unmapped_removed.append(_node_view(before_node))
            continue
        added_index = candidates[0]
        used_added_indexes.add(added_index)
        after_node = remaining_added[added_index]
        remapped.append(
            {
                "match": "unique-source-text-within-entry",
                "sourceText": before_node["sourceText"],
                "before": _node_view(before_node),
                "after": _node_view(after_node),
            }
        )

    unmapped_added = [
        _node_view(node)
        for index, node in enumerate(remaining_added)
        if index not in used_added_indexes
    ]
    return {
        "unchanged": unchanged,
        "remapped": remapped,
        "removed": unmapped_removed,
        "added": unmapped_added,
    }


def _source_headword(payload: dict[str, Any]) -> str:
    source = payload.get("_source") or {}
    evidence = source.get("identity_evidence") or {}
    return evidence.get("headword_raw") or payload.get("headword") or ""


def _identity(payload: dict[str, Any]) -> dict[str, Any]:
    source = payload.get("_source") or {}
    return {
        "providerArticleId": source.get("provider_article_id"),
        "senseOrdinal": source.get("sense_ordinal"),
        "sourceEntryKey": source.get("source_entry_key"),
        "sourceGroupKey": source.get("source_group_key"),
        "sourceIndex": source.get("source_index"),
    }


def audit_data_dir(data_dir: Path | str) -> dict[str, Any]:
    """Return a read-only parser/artifact diff for a versioned data directory."""
    manifest = load_source_manifest(data_dir)
    changes = []
    failures = []
    shape_counts = Counter()
    shape_variants = Counter()

    for artifact in manifest.artifacts:
        payload = artifact.payload
        raw_html = payload.get("_raw_html") or ""
        artifact_counts, artifact_variants = _source_shape_census(raw_html)
        shape_counts.update(artifact_counts)
        shape_variants.update(artifact_variants)
        try:
            reparsed = parse_vandale_entry_fixed(
                raw_html,
                _source_headword(payload),
            )
            parsed_meanings = reparsed.get("meanings") or []
            if parsed_meanings:
                if artifact.sense_ordinal > len(parsed_meanings):
                    raise ValueError(
                        "sense ordinal exceeds reparsed meaning count"
                    )
                after_meanings = [
                    deepcopy(parsed_meanings[artifact.sense_ordinal - 1])
                ]
            else:
                after_meanings = []
            before_meanings = payload.get("meanings") or []
            if before_meanings == after_meanings:
                continue

            candidate_payload = deepcopy(payload)
            candidate_payload["meanings"] = after_meanings
            before_identity = _identity(payload)
            after_identity = _identity(candidate_payload)
            changes.append(
                {
                    "artifactPath": artifact.artifact_path,
                    "headword": payload.get("headword"),
                    "identity": before_identity,
                    "entryIdentityChanged": before_identity != after_identity,
                    "beforeMeanings": before_meanings,
                    "afterMeanings": after_meanings,
                    "fingerprints": {
                        "beforeSemantic": artifact.content_fingerprint,
                        "afterSemantic": semantic_content_fingerprint(
                            candidate_payload
                        ),
                        "beforeStoredRaw": stored_raw_fingerprint(payload),
                        "afterStoredRaw": stored_raw_fingerprint(
                            candidate_payload
                        ),
                    },
                    "nodeDiff": _node_diff(payload, candidate_payload),
                }
            )
        except Exception as error:
            failures.append(
                {
                    "artifactPath": artifact.artifact_path,
                    "errorType": type(error).__name__,
                    "message": str(error),
                }
            )

    variants = [
        {
            "expressionSpanCount": signature[0],
            "explanationSpanCount": signature[1],
            "nestedExampleSpanCount": signature[2],
            "sectionLabel": signature[3],
            "blockCount": count,
        }
        for signature, count in sorted(shape_variants.items())
    ]
    return {
        "formatVersion": REPORT_FORMAT_VERSION,
        "artifactFormatVersion": manifest.artifact_format_version,
        "identitySchemeVersion": manifest.identity_scheme_version,
        "manifestSha256": manifest.manifest_sha256,
        "sourceRecordCount": manifest.source_record_count,
        "scannedArtifactCount": len(manifest.artifacts),
        "changedArtifactCount": len(changes),
        "failureCount": len(failures),
        "sourceShapeCensus": dict(sorted(shape_counts.items())),
        "falsePositiveGuards": {
            "classifiedBareVoorbeeldenBlocks": shape_counts[
                "bareVoorbeeldenBlocks"
            ],
            "retainedBareNonVoorbeeldenBlocks": shape_counts[
                "bareNonVoorbeeldenBlocks"
            ],
            "retainedBlocksWithExplanation": shape_counts[
                "blocksWithExplanation"
            ],
            "retainedBlocksWithNestedExamples": shape_counts[
                "blocksWithNestedExamples"
            ],
        },
        "sourceShapeVariants": variants,
        "changes": changes,
        "failures": failures,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Compare Van Dale source HTML classification with versioned "
            "artifacts without writing data."
        )
    )
    parser.add_argument("--data-dir", type=Path, required=True)
    arguments = parser.parse_args()
    report = audit_data_dir(arguments.data_dir)
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    if report["failureCount"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
