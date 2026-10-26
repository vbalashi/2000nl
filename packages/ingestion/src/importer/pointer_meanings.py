from __future__ import annotations

import json
from pathlib import Path
import re
from typing import Any


POINTER_TOKEN = re.compile(r"^[^\s]+-$")
def pointer_only_target(entry: dict[str, Any]) -> str | None:
    meanings = entry.get("meanings")
    if not isinstance(meanings, list) or len(meanings) != 1:
        return None
    meaning = meanings[0]
    if not isinstance(meaning, dict):
        return None
    definition = meaning.get("definition")
    if not isinstance(definition, str):
        return None
    target = definition.strip()
    if not POINTER_TOKEN.fullmatch(target):
        return None
    if any(
        value not in (None, "", [], {})
        for field, value in meaning.items()
        if field != "definition"
    ):
        return None
    return target


def promote_resolvable_pointer_only_meaning(
    entry: dict[str, Any],
    available_headwords: set[str],
) -> dict[str, Any]:
    """Promote provider pointer semantics without inferring from punctuation alone."""
    target = pointer_only_target(entry)
    if (
        target is None
        or target == entry.get("headword")
        or target not in available_headwords
    ):
        return entry
    entry["cross_reference"] = target
    entry["meanings"] = []
    return entry


def audit_pointer_meanings(
    data_dir: Path | str,
    *,
    sample_limit: int,
) -> dict[str, Any]:
    if sample_limit < 1:
        raise ValueError("sample_limit must be positive")
    root = Path(data_dir)
    artifacts = sorted(
        path for path in root.glob("*.json") if not path.name.startswith("_")
    )
    payloads = [(path, _load_entry(path)) for path in artifacts]
    available_headwords = {
        entry["headword"].strip()
        for _, entry in payloads
        if isinstance(entry.get("headword"), str) and entry["headword"].strip()
    }
    counts = {
        "resolvablePointerOnly": 0,
        "unresolvedPointerShape": 0,
        "hyphenatedContent": 0,
    }
    candidates = []

    for path, entry in payloads[:sample_limit]:
        definitions = _definitions(entry)
        if not any("-" in definition for definition in definitions):
            continue
        target = pointer_only_target(entry)
        if target is None:
            counts["hyphenatedContent"] += 1
            continue
        resolved = target in available_headwords and target != entry.get("headword")
        classification = (
            "resolvable-pointer-only" if resolved else "unresolved-pointer-shape"
        )
        counts[
            "resolvablePointerOnly" if resolved else "unresolvedPointerShape"
        ] += 1
        candidates.append(
            {
                "artifact": path.name,
                "headword": entry.get("headword"),
                "meaningId": entry.get("meaning_id"),
                "target": target,
                "classification": classification,
            }
        )

    return {
        "sampleLimit": sample_limit,
        "sampledEntries": min(len(payloads), sample_limit),
        "corpusEntries": len(payloads),
        "counts": counts,
        "candidates": candidates,
    }


def _load_entry(path: Path) -> dict[str, Any]:
    content = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(content, list) or not content or not isinstance(content[0], dict):
        raise ValueError(f"{path} must contain an entry array")
    return content[0]


def _definitions(entry: dict[str, Any]) -> list[str]:
    meanings = entry.get("meanings")
    if not isinstance(meanings, list):
        return []
    return [
        meaning["definition"]
        for meaning in meanings
        if isinstance(meaning, dict) and isinstance(meaning.get("definition"), str)
    ]
