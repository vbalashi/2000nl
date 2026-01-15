#!/usr/bin/env python3
import json
import re
from pathlib import Path

AUDIO_PATTERN = re.compile(r"https?://spraak/([^\"'<>\s]+)")

def update_string(value: str) -> str:
    def repl(match: re.Match) -> str:
        path = match.group(1)
        if path.endswith(".mp3"):
            return f"/audio/{path}"
        return f"/audio/{path}.mp3"

    return AUDIO_PATTERN.sub(repl, value)


def update_value(value):
    if isinstance(value, str):
        return update_string(value)
    if isinstance(value, list):
        return [update_value(item) for item in value]
    if isinstance(value, dict):
        return {key: update_value(item) for key, item in value.items()}
    return value


def main() -> None:
    root = Path("/home/khrustal/dev/2000nl-ui/db/data/words_content")
    files = sorted(root.glob("*.json"))
    if not files:
        raise SystemExit(f"No JSON files found in {root}")

    updated_files = 0
    for path in files:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
        updated = update_value(data)
        updated_text = json.dumps(updated, ensure_ascii=False, indent=2)
        if updated_text != raw:
            path.write_text(updated_text + "\n", encoding="utf-8")
            updated_files += 1

    print(f"Updated {updated_files} files out of {len(files)}")


if __name__ == "__main__":
    main()
