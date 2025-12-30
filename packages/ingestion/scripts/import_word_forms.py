from __future__ import annotations

import argparse
import json
import logging
import os
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

import psycopg2
import psycopg2.extras

from importer.db import load_existing_entries
from importer.word_forms import extract_word_forms


DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/dictionary"
DEFAULT_DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "words_content"


def iter_entries(data_dir: Path) -> Iterable[Tuple[Path, dict]]:
    for path in sorted(data_dir.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not payload:
            continue
        entry = payload[0]
        yield path, entry


def collect_forms(data_dir: Path) -> Dict[str, List[str]]:
    """
    Returns a mapping: headword -> list of forms (normalized, lowercase).
    """
    output: Dict[str, List[str]] = {}

    for path, entry in iter_entries(data_dir):
        headword = entry.get("headword")
        if not headword:
            logging.warning("Skipping %s: missing headword", path.name)
            continue

        forms = extract_word_forms(entry)
        output[headword] = sorted(forms)

    return output


def insert_forms(
    connection,
    language_code: str,
    headword_to_id: Dict[str, str],
    forms_by_headword: Dict[str, List[str]],
) -> Tuple[int, int]:
    inserted = 0
    skipped = 0

    records = []
    for headword, forms in forms_by_headword.items():
        word_id = headword_to_id.get(headword)
        if not word_id:
            skipped += 1
            logging.warning("No database row found for headword '%s'; skipping its forms.", headword)
            continue
        for form in forms:
            records.append((language_code, form, word_id, headword))

    with connection.cursor() as cursor:
        cursor.execute("delete from word_forms where language_code = %s", (language_code,))
        if records:
            psycopg2.extras.execute_values(
                cursor,
                """
                insert into word_forms (language_code, form, word_id, headword)
                values %s
                on conflict (language_code, form, word_id) do nothing
                """,
                records,
            )
            inserted = len(records)

    return inserted, skipped


def main() -> None:
    parser = argparse.ArgumentParser(description="Build word form lookup table from dictionary JSON files.")
    parser.add_argument(
        "--data-dir",
        "-d",
        default=DEFAULT_DATA_DIR,
        help="Path to directory with dictionary JSON entries (default: data/words_content).",
    )
    parser.add_argument(
        "--database-url",
        "-u",
        default=os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL),
        help="Postgres connection string (env DATABASE_URL can override).",
    )
    parser.add_argument(
        "--language",
        "-l",
        default="nl",
        help="Language code for the imported entries.",
    )

    args = parser.parse_args()
    data_dir = Path(args.data_dir)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    if not data_dir.exists():
        parser.error(f"{data_dir} does not exist")

    logging.info("Collecting forms from %s ...", data_dir)
    forms_by_headword = collect_forms(data_dir)
    logging.info("Found %d headwords with forms.", len(forms_by_headword))

    logging.info("Connecting to database ...")
    connection = psycopg2.connect(args.database_url)

    with connection:
        with connection.cursor() as cursor:
            existing = load_existing_entries(cursor, args.language)
            # load_existing_entries now keys by (headword, meaning_id); use the first id per headword
            headword_to_id: Dict[str, str] = {}
            for (headword, _meaning_id), word_id in existing.items():
                if headword not in headword_to_id:
                    headword_to_id[headword] = word_id
        inserted, skipped = insert_forms(connection, args.language, headword_to_id, forms_by_headword)

    logging.info("Inserted %d word-form rows (%d headwords missing in DB).", inserted, skipped)


if __name__ == "__main__":
    main()


