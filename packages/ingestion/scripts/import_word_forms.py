from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

import psycopg2
import psycopg2.extras

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from importer.db import ensure_dictionary, load_existing_entries, refresh_dictionary_search_documents
from importer.source_manifest import load_source_manifest
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


def collect_source_forms(
    data_dir: Path,
) -> Tuple[str, str, Dict[str, Tuple[str, List[str]]]]:
    """
    Return versioned source-entry keys mapped to their headword and forms.

    Unlike the legacy natural key, a source-entry key keeps homographs and
    restored senses separate even when their headword and meaning number are
    identical.
    """
    manifest = load_source_manifest(data_dir)
    output: Dict[str, Tuple[str, List[str]]] = {}
    for artifact in manifest.artifacts:
        headword = artifact.payload.get("headword")
        if not isinstance(headword, str) or not headword.strip():
            raise ValueError(
                f"{artifact.source_entry_key} is missing a valid headword"
            )
        output[artifact.source_entry_key] = (
            headword,
            sorted(extract_word_forms(artifact.payload)),
        )
    return (
        manifest.identity_scheme_version,
        manifest.manifest_sha256,
        output,
    )


def load_source_binding_ids(
    cursor,
    dictionary_id: str,
    identity_scheme_version: str,
    manifest_checksum: str,
) -> Dict[str, str]:
    cursor.execute(
        """
        select source_entry_key, word_entry_id::text, manifest_checksum
        from private.source_entry_bindings
        where dictionary_id = %s
          and identity_scheme_version = %s
          and binding_state = 'active'
        """,
        (dictionary_id, identity_scheme_version),
    )
    rows = cursor.fetchall()
    mismatched = [
        source_key
        for source_key, _, binding_manifest_checksum in rows
        if binding_manifest_checksum != manifest_checksum
    ]
    if mismatched:
        raise RuntimeError(
            f"{len(mismatched)} active source bindings belong to a "
            "different manifest; import entries before rebuilding forms"
        )
    return {source_key: word_id for source_key, word_id, _ in rows}


def validate_source_binding_coverage(
    forms_by_source_key: Dict[str, Tuple[str, List[str]]],
    source_key_to_id: Dict[str, str],
) -> None:
    artifact_keys = set(forms_by_source_key)
    binding_keys = set(source_key_to_id)
    missing = artifact_keys - binding_keys
    extra = binding_keys - artifact_keys
    if missing or extra:
        raise RuntimeError(
            "Source form import requires exact active-binding coverage "
            f"(missing {len(missing)}, extra {len(extra)})"
        )


def insert_source_forms(
    connection,
    language_code: str,
    dictionary_id: str,
    source_key_to_id: Dict[str, str],
    forms_by_source_key: Dict[str, Tuple[str, List[str]]],
    refresh_search_documents_after_import: bool,
) -> Tuple[int, int]:
    validate_source_binding_coverage(forms_by_source_key, source_key_to_id)

    records = []
    touched_word_ids = set()
    for source_key, (headword, forms) in forms_by_source_key.items():
        word_id = source_key_to_id[source_key]
        touched_word_ids.add(word_id)
        records.extend(
            (language_code, dictionary_id, form, word_id, headword)
            for form in forms
        )

    with connection.cursor() as cursor:
        cursor.execute(
            "delete from word_forms where language_code = %s and dictionary_id = %s",
            (language_code, dictionary_id),
        )
        if records:
            psycopg2.extras.execute_values(
                cursor,
                """
                insert into word_forms (
                    language_code, dictionary_id, form, word_id, headword
                )
                values %s
                """,
                records,
                page_size=1000,
            )
        refreshed = 0
        if refresh_search_documents_after_import:
            refreshed = refresh_dictionary_search_documents(
                cursor,
                touched_word_ids,
            )
    return len(records), refreshed


def insert_forms(
    connection,
    language_code: str,
    dictionary_id: str,
    entry_key_to_id: Dict[Tuple[str, int], str],
    forms_by_entry_key: Dict[Tuple[str, int], List[str]],
    refresh_search_documents_after_import: bool,
) -> Tuple[int, int, int]:
    inserted = 0
    skipped = 0
    refreshed = 0

    records = []
    touched_word_ids = set()
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
        touched_word_ids.add(word_id)
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
        if refresh_search_documents_after_import:
            refreshed = refresh_dictionary_search_documents(cursor, touched_word_ids)

    return inserted, skipped, refreshed


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
        default="nl-vandale-v2",
        help="Dictionary schema key registered in dictionary_schemas.",
    )
    parser.add_argument(
        "--dictionary-schema-version",
        type=int,
        default=1,
        help="Dictionary schema version registered in dictionary_schemas.",
    )
    parser.add_argument(
        "--refresh-search-documents",
        action="store_true",
        help="Refresh dictionary_search_documents after importing forms. For full imports, prefer a controlled backfill job.",
    )
    parser.add_argument(
        "--allow-legacy-natural-key",
        action="store_true",
        help=(
            "Allow a manifest-free import keyed by headword and meaning_id. "
            "Unsafe for the versioned Van Dale corpus."
        ),
    )

    args = parser.parse_args()
    data_dir = Path(args.data_dir)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    if not data_dir.exists():
        parser.error(f"{data_dir} does not exist")

    has_manifest = (
        (data_dir / "_manifest.jsonl").is_file()
        and (data_dir / "_manifest.summary.json").is_file()
    )
    if not has_manifest and not args.allow_legacy_natural_key:
        parser.error(
            f"{data_dir} has no versioned source manifest; "
            "use --allow-legacy-natural-key only for legacy fixtures"
        )

    logging.info("Connecting to database ...")
    connection = psycopg2.connect(args.database_url)

    with connection:
        with connection.cursor() as cursor:
            if has_manifest:
                cursor.execute(
                    """
                    select id::text
                    from dictionaries
                    where language_code = %s and slug = %s
                    """,
                    (args.language, args.dictionary_slug),
                )
                row = cursor.fetchone()
                if row is None:
                    raise RuntimeError(
                        "Import the source manifest before rebuilding forms"
                    )
                dictionary_id = row[0]
                (
                    identity_scheme,
                    manifest_checksum,
                    forms_by_source_key,
                ) = collect_source_forms(data_dir)
                source_bindings = load_source_binding_ids(
                    cursor,
                    dictionary_id,
                    identity_scheme,
                    manifest_checksum,
                )
            else:
                dictionary_id = ensure_dictionary(
                    cursor,
                    args.language,
                    args.dictionary_slug,
                    args.dictionary_name,
                    None,
                    args.dictionary_schema_key,
                    args.dictionary_schema_version,
                )
                forms_by_entry_key = collect_forms(data_dir)
                existing = load_existing_entries(
                    cursor,
                    args.language,
                    dictionary_id,
                )
        if has_manifest:
            logging.info(
                "Found %d versioned source entries with forms.",
                len(forms_by_source_key),
            )
            inserted, refreshed = insert_source_forms(
                connection,
                args.language,
                dictionary_id,
                source_bindings,
                forms_by_source_key,
                args.refresh_search_documents,
            )
            skipped = 0
        else:
            logging.warning(
                "Using legacy natural-key form matching by explicit request."
            )
            inserted, skipped, refreshed = insert_forms(
                connection,
                args.language,
                dictionary_id,
                existing,
                forms_by_entry_key,
                args.refresh_search_documents,
            )

    logging.info(
        "Inserted %d word-form rows (%d headwords missing in DB); refreshed %d search documents.",
        inserted,
        skipped,
        refreshed,
    )


if __name__ == "__main__":
    main()
