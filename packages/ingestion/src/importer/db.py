from __future__ import annotations

from typing import Dict, Optional, Set, Tuple

import psycopg2.extras
from psycopg2.extensions import cursor as Cursor

from importer.dictionary_entry_parser import ParsedEntry


def ensure_language(cursor: Cursor, code: str, name: str) -> None:
    cursor.execute(
        """
        insert into languages (code, name)
        values (%s, %s)
        on conflict (code) do update
        set name = excluded.name
        """,
        (code, name),
    )


def ensure_word_list(
    cursor: Cursor,
    language_code: str,
    slug: str,
    name: str,
    description: Optional[str],
    is_primary: bool,
) -> str:
    cursor.execute(
        """
        insert into word_lists (language_code, slug, name, description, is_primary)
        values (%s, %s, %s, %s, %s)
        on conflict (language_code, slug) do update
        set name = excluded.name,
            description = coalesce(excluded.description, word_lists.description),
            is_primary = word_lists.is_primary or excluded.is_primary
        returning id
        """,
        (language_code, slug, name, description, is_primary),
    )
    return cursor.fetchone()[0]


def load_existing_entries(cursor: Cursor, language_code: str) -> Dict[tuple[str, int], str]:
    cursor.execute(
        "select id, headword, meaning_id from word_entries where language_code = %s",
        (language_code,),
    )
    return {(row[1], int(row[2])): row[0] for row in cursor.fetchall()}


def load_list_state(
    cursor: Cursor, list_id: str
) -> Tuple[Set[str], int]:
    cursor.execute(
        "select word_id, rank from word_list_items where list_id = %s", (list_id,)
    )
    word_ids: Set[str] = set()
    max_rank = 0
    for word_id, rank in cursor.fetchall():
        word_ids.add(word_id)
        if isinstance(rank, int) and rank > max_rank:
            max_rank = rank
    return word_ids, max_rank


def upsert_word_entry(
    cursor: Cursor,
    language_code: str,
    entry: ParsedEntry,
    cache: Dict[tuple[str, int], str],
) -> Tuple[str, bool]:
    """
    Inserts or updates a word entry, returning the row id and whether it was inserted.
    """
    cache_key = (entry.headword, entry.meaning_id)
    if cache_key in cache:
        word_id = cache[cache_key]
        cursor.execute(
            """
            update word_entries
            set part_of_speech = %s,
                gender = %s,
                is_nt2_2000 = %s,
                vandale_id = %s,
                raw = %s,
                meaning_id = %s
            where id = %s
            """,
            (
                entry.part_of_speech,
                entry.gender,
                entry.is_nt2_2000,
                entry.vandale_id,
                psycopg2.extras.Json(entry.raw),
                entry.meaning_id,
                word_id,
            ),
        )
        return word_id, False

    cursor.execute(
        """
        insert into word_entries (
            language_code, headword, meaning_id, part_of_speech, gender,
            is_nt2_2000, vandale_id, raw
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s)
        returning id
        """,
        (
            language_code,
            entry.headword,
            entry.meaning_id,
            entry.part_of_speech,
            entry.gender,
            entry.is_nt2_2000,
            entry.vandale_id,
            psycopg2.extras.Json(entry.raw),
        ),
    )
    word_id = cursor.fetchone()[0]
    cache[cache_key] = word_id
    return word_id, True
