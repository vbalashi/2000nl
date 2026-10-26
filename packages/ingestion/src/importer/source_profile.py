"""Installation metadata shared with the app; no dictionary content or secrets."""
from __future__ import annotations

import json
import os
from pathlib import Path

PROFILE_PATH = Path(__file__).resolve().parents[4] / "packages/shared/dictionary-source/defaults.json"


def source_profile_value(key: str) -> str:
    try:
        profile = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
        configured = os.environ.get("DICTIONARY_SOURCE_PROFILE_JSON")
        configured_file = os.environ.get("DICTIONARY_SOURCE_PROFILE_FILE")
        if configured is not None and configured_file is not None:
            raise ValueError()
        if configured_file is not None:
            configured = Path(configured_file).read_text(encoding="utf-8")
        if configured is None:
            configured = os.environ.get("NEXT_PUBLIC_DICTIONARY_SOURCE_PROFILE")
        if configured is not None:
            override = json.loads(configured)
            if not isinstance(override, dict) or any(
                name not in profile or not isinstance(value, str)
                or not value.strip() or len(value) > 500
                for name, value in override.items()
            ):
                raise ValueError()
            profile = {**profile, **override}
        value = profile[key]
    except (OSError, ValueError, KeyError, TypeError):
        raise ValueError("invalid_dictionary_source_profile") from None
    if not isinstance(value, str) or not value.strip() or len(value) > 500:
        raise ValueError("invalid_dictionary_source_profile")
    return value
