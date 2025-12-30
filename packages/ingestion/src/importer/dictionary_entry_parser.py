from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional


@dataclass(frozen=True)
class ParsedEntry:
    headword: str
    meaning_id: int
    part_of_speech: Optional[str]
    gender: Optional[str]
    is_nt2_2000: bool
    vandale_id: Optional[int]
    raw: Dict[str, Any]


def normalize_part_of_speech(value: Any) -> Optional[str]:
    if not value:
        return None

    raw_text = str(value).strip().lower()
    normalized = raw_text.strip("().;:, ")

    if any(token in normalized for token in ("werkwoord", "ww")):
        return "ww"
    if any(token in normalized for token in ("zelfstandig naamwoord", "znw", "zn")):
        return "zn"
    if "bijwoord" in normalized or normalized == "bw":
        return "bw"
    if "bijvoeglijk naamwoord" in normalized or normalized == "bn":
        return "bn"
    if "voorzetsel" in normalized or normalized == "vz":
        return "vz"
    if "voorvoegsel" in normalized or normalized in {"vv", "vvs"}:
        return "vv"
    if "afkorting" in normalized or normalized == "afk":
        return "afk"
    if "voornaamwoord" in normalized or normalized == "vnw":
        return "vnw"
    if "voegwoord" in normalized or normalized == "vw":
        return "vw"
    if "telwoord" in normalized or normalized in {"tw", "telw"}:
        return "tw"
    if "lidwoord" in normalized or normalized == "lidw":
        return "lidw"

    return normalized or None


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes"}
    return False


def _extract_vandale_id(metadata: Any) -> Optional[int]:
    if not isinstance(metadata, dict):
        return None

    rank = metadata.get("index")
    if isinstance(rank, int):
        return rank
    if isinstance(rank, str) and rank.isdigit():
        try:
            return int(rank)
        except ValueError:
            return None
    return None


def _extract_meaning_id(payload: dict[str, Any], path: Path) -> int:
    """
    Meaning id is stored in the JSON payload when entries were split. Fall back
    to a trailing "_<number>" in the filename (e.g., foo_bw_2.json) so we still
    separate multiple files for the same headword even if the field is missing.
    """
    value = payload.get("meaning_id")
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())

    stem = path.stem  # e.g., "ergens_bw_2"
    parts = stem.rsplit("_", 1)
    if len(parts) == 2 and parts[1].isdigit():
        return int(parts[1])

    return 1


def parse_dictionary_file(path: Path) -> ParsedEntry:
    content = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(content, list) or not content:
        raise ValueError(f"{path} must contain a non-empty array")

    payload = content[0]
    if not isinstance(payload, dict):
        raise ValueError(f"{path} first item must be an object")

    # Do not ship raw HTML to the database.
    sanitized = dict(payload)
    sanitized.pop("_raw_html", None)

    headword = payload.get("headword")
    if not isinstance(headword, str) or not headword.strip():
        raise ValueError(f"{path} missing headword")

    gender = payload.get("gender")
    if isinstance(gender, str):
        gender = gender.strip() or None
    else:
        gender = None

    return ParsedEntry(
        headword=headword.strip(),
        meaning_id=_extract_meaning_id(payload, path),
        part_of_speech=normalize_part_of_speech(payload.get("part_of_speech")),
        gender=gender,
        is_nt2_2000=_to_bool(payload.get("is_nt2_2000")),
        vandale_id=_extract_vandale_id(payload.get("_metadata")),
        raw=sanitized,
    )
