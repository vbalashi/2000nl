from __future__ import annotations

import argparse
import json
import logging
import os
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

import psycopg2
import psycopg2.extras

from importer.db import ensure_dictionary, load_existing_entries
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


def collect_forms(data_dir: Path) -> Dict[Tuple[str, int], List[str]]:
    """
    Returns a mapping: (headword, meaning_id) -> list of forms (normalized, lowercase).
    """
    output: Dict[Tuple[str, int], List[str]] = {}

    for path, entry in iter_entries(data_dir):
        headword = entry.get("headword")
        if not headword:
            logging.warning("Skipping %s: missing headword", path.name)
            continue
        meaning_id = entry.get("meaning_id") or 1
        try:
            meaning_id = int(meaning_id)
        except (TypeError, ValueError):
            logging.warning(
                "Skipping %s: invalid meaning_id %r",
                path.name,
                entry.get("meaning_id"),
            )
            continue

        forms = extract_word_forms(entry)
        output[(headword, meaning_id)] = sorted(forms)

    return output


def insert_forms(
    connection,
    language_code: str,
    dictionary_id: str,
    entry_key_to_id: Dict[Tuple[str, int], str],
    forms_by_entry_key: Dict[Tuple[str, int], List[str]],
) -> Tuple[int, int]:
    inserted = 0
    skipped = 0

    records = []
    for (headword, meaning_id), forms in forms_by_entry_key.items():
        word_id = entry_key_to_id.get((headword, meaning_id))
        if not word_id:
            skipped += 1
            logging.warning(
                "No database row found for headword '%s' meaning #%s; skipping its forms.",
                headword,
                meaning_id,
            )
            continue
        for form in forms:
            records.append((language_code, dictionary_id, form, word_id, headword))

    with connection.cursor() as cursor:
        cursor.execute(
            "delete from word_forms where language_code = %s and dictionary_id = %s",
            (language_code, dictionary_id),
        )
        if records:
            psycopg2.extras.execute_values(
                cursor,
                """
                insert into word_forms (language_code, dictionary_id, form, word_id, headword)
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
    parser.add_argument(
        "--dictionary-slug",
        default="nl-vandale",
        help="Slug of the dictionary whose entries should receive word forms.",
    )
    parser.add_argument(
        "--dictionary-name",
        default="VanDale Dutch",
        help="Name of the dictionary whose entries should receive word forms.",
    )
    parser.add_argument(
        "--dictionary-schema-key",
        default="nl-vandale-v1",
        help="Dictionary schema key registered in dictionary_schemas.",
    )
    parser.add_argument(
        "--dictionary-schema-version",
        type=int,
        default=1,
        help="Dictionary schema version registered in dictionary_schemas.",
    )

    args = parser.parse_args()
    data_dir = Path(args.data_dir)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    if not data_dir.exists():
        parser.error(f"{data_dir} does not exist")

    logging.info("Collecting forms from %s ...", data_dir)
    forms_by_entry_key = collect_forms(data_dir)
    logging.info("Found %d entry meanings with forms.", len(forms_by_entry_key))

    logging.info("Connecting to database ...")
    connection = psycopg2.connect(args.database_url)

    with connection:
        with connection.cursor() as cursor:
            dictionary_id = ensure_dictionary(
                cursor,
                args.language,
                args.dictionary_slug,
                args.dictionary_name,
                None,
                args.dictionary_schema_key,
                args.dictionary_schema_version,
            )
            existing = load_existing_entries(cursor, args.language, dictionary_id)
        inserted, skipped = insert_forms(
            connection,
            args.language,
            dictionary_id,
            existing,
            forms_by_entry_key,
        )

    logging.info("Inserted %d word-form rows (%d headwords missing in DB).", inserted, skipped)


if __name__ == "__main__":
    main()
