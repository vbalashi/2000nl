import json
import os
from pathlib import Path

import pytest

# These checks iterate over the full exported dataset (~90MB) and are therefore
# opt‑in. Enable with `RUN_DATA_QUALITY_CHECKS=1` when you want a full report.
pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_DATA_QUALITY_CHECKS") != "1",
    reason="Set RUN_DATA_QUALITY_CHECKS=1 to run data-quality checks against words_content.",
)

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "words_content"


def _iter_entries():
    for path in sorted(DATA_DIR.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not payload:
            continue
        entry = payload[0]
        yield path, entry


def test_part_of_speech_present_unless_cross_reference_only():
    """
    Surface entries where part_of_speech could not be parsed.

    Entries that are pure cross-references (no meanings) are allowed to be
    missing a POS; everything else should carry a value.
    """
    missing = []
    allowed_missing = []

    for path, entry in _iter_entries():
        pos = (entry.get("part_of_speech") or "").strip()
        if pos:
            continue

        if entry.get("cross_reference") and not entry.get("meanings"):
            allowed_missing.append(path.name)
        else:
            missing.append(path.name)

    if missing:
        sample = missing[:20]
        pytest.fail(
            f"{len(missing)} entries missing part_of_speech (examples: {sample}). "
            f"Allowed missing (cross references only): {len(allowed_missing)}"
        )


def test_headword_is_not_mixed_with_pronunciation():
    """
    Headword should not include pronunciation bracket fragments like `[gloor]`.
    """
    offenders = []
    for path, entry in _iter_entries():
        headword = entry.get("headword") or ""
        if "[" in headword or "]" in headword:
            offenders.append(path.name)

    if offenders:
        sample = offenders[:20]
        pytest.fail(
            f"{len(offenders)} entries have pronunciation stuck to headword "
            f"(examples: {sample})"
        )


def test_audio_links_shape():
    """
    Ensure audio_links always exposes both nl/be keys even if None.
    """
    offenders = []
    for path, entry in _iter_entries():
        audio = entry.get("audio_links")
        if not isinstance(audio, dict):
            offenders.append(path.name)
            continue
        if not all(k in audio for k in ("nl", "be")):
            offenders.append(path.name)

    if offenders:
        sample = offenders[:20]
        pytest.fail(
            f"{len(offenders)} entries have malformed audio_links (examples: {sample})"
        )


def test_meanings_not_packed_together():
    """
    Flag entries that bundle multiple meanings into a single JSON file.
    """
    offenders = []
    for path, entry in _iter_entries():
        meanings = entry.get("meanings") or []
        if len(meanings) > 1:
            offenders.append((path.name, len(meanings)))

    if offenders:
        preview = ", ".join(f\"{name}({count})\" for name, count in offenders[:20])
        pytest.fail(
            f\"{len(offenders)} entries contain multiple meanings; consider splitting "
            f\"into one file per meaning. Examples: {preview}\"
        )

