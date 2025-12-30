from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from collections import deque
from pathlib import Path
from typing import Optional, List

import psycopg2
import psycopg2.extras

from importer.db import (
    ensure_language,
    ensure_word_list,
    load_existing_entries,
    load_list_state,
)
from importer.dictionary_entry_parser import ParsedEntry, parse_dictionary_file


logger = logging.getLogger(__name__)


@dataclass
class ImportStats:
    total_files: int
    inserted: int = 0
    updated: int = 0
    nt2_linked: int = 0
    nt2_skipped: int = 0
    processed: int = 0


def import_entries(
    data_dir: Path | str,
    database_url: str,
    language_code: str = "nl",
    language_name: str = "Dutch",
    nt2_slug: str = "nt2-2000",
    nt2_name: str = "NT2 – 2000 woorden",
    nt2_description: Optional[str] = "Core 2000 woorden voor NT2",
) -> ImportStats:
    path = Path(data_dir)
    if not path.exists():
        raise FileNotFoundError(f"{path} does not exist")

    files = sorted([file for file in path.rglob("*.json") if file.is_file()])
    stats = ImportStats(total_files=len(files))

    if not files:
        logger.info("No JSON files found in %s", path)
        return stats

    if database_url.startswith("http:") or database_url.startswith("https:"):
        raise ValueError(
            "Invalid DATABASE_URL: It looks like you are using an HTTP URL (e.g., the Supabase API URL). "
            "You must use a PostgreSQL connection string starting with 'postgres://' or 'postgresql://'. "
            "Check your Supabase Dashboard -> Settings -> Database -> Connection string."
        )

    try:
        connection = psycopg2.connect(database_url)
    except psycopg2.OperationalError as e:
        if "Network is unreachable" in str(e) and "supabase.co" in database_url:
            raise ValueError(
                "Connection failed: Network is unreachable. "
                "You are likely trying to connect to the Supabase 'Direct connection' (IPv6) from an IPv4 network. "
                "Please use the 'Session Pooler' connection string (port 6543) instead. "
                "Check your Supabase Dashboard -> Settings -> Database -> Connection string -> Mode: Session."
            ) from e
        raise e

    with connection as conn:
        with conn.cursor() as cursor:
            ensure_language(cursor, language_code, language_name)
            list_id = ensure_word_list(
                cursor,
                language_code,
                nt2_slug,
                nt2_name,
                nt2_description,
                True,
            )
            existing_entries = load_existing_entries(cursor, language_code)
            existing_list_items, max_rank = load_list_state(cursor, list_id)
            next_rank = max_rank + 1
            start_time = time.time()
            last_seen = deque(maxlen=10)
            log_every = max(25, len(files) // 200 or 1)  # ~200 updates total

            batch_map: dict[tuple[str, int], ParsedEntry] = {}
            batch_size = 200

            def flush_batch():
                nonlocal next_rank
                if not batch_map:
                    return

                entries = list(batch_map.values())
                values = [
                    (
                        language_code,
                        entry.headword,
                        entry.meaning_id,
                        entry.part_of_speech,
                        entry.gender,
                        entry.is_nt2_2000,
                        entry.vandale_id,
                        psycopg2.extras.Json(entry.raw),
                    )
                    for entry in entries
                ]

                # Track inserted vs updated using existing cache
                for entry in entries:
                    cache_key = (entry.headword, entry.meaning_id)
                    if cache_key in existing_entries:
                        stats.updated += 1
                    else:
                        stats.inserted += 1

                psycopg2.extras.execute_values(
                    cursor,
                    """
                    insert into word_entries (
                        language_code, headword, meaning_id, part_of_speech, gender,
                        is_nt2_2000, vandale_id, raw
                    )
                    values %s
                    on conflict (language_code, headword, meaning_id) do update
                        set part_of_speech = excluded.part_of_speech,
                            gender = excluded.gender,
                            is_nt2_2000 = excluded.is_nt2_2000,
                            vandale_id = excluded.vandale_id,
                            raw = excluded.raw
                    returning id, headword, meaning_id
                    """,
                    values,
                    template="(%s,%s,%s,%s,%s,%s,%s,%s)",
                    page_size=batch_size,
                )
                returned = cursor.fetchall()
                for word_id, headword, meaning_id in returned:
                    existing_entries[(headword, int(meaning_id))] = word_id

                nt2_rows = []
                for entry in entries:
                    if not entry.is_nt2_2000:
                        continue
                    word_id = existing_entries.get((entry.headword, entry.meaning_id))
                    if word_id in existing_list_items:
                        stats.nt2_skipped += 1
                        continue
                    nt2_rows.append((list_id, word_id, next_rank))
                    existing_list_items.add(word_id)
                    next_rank += 1
                    stats.nt2_linked += 1

                if nt2_rows:
                    psycopg2.extras.execute_values(
                        cursor,
                        """
                        insert into word_list_items (list_id, word_id, rank)
                        values %s
                        on conflict do nothing
                        """,
                        nt2_rows,
                        template="(%s,%s,%s)",
                        page_size=batch_size,
                    )

                if (
                    stats.processed % log_every == 0
                    or stats.processed == stats.total_files
                ):
                    elapsed = time.time() - start_time
                    rate = stats.processed / elapsed if elapsed > 0 else 0
                    remaining = stats.total_files - stats.processed
                    eta = remaining / rate if rate > 0 else float("inf")
                    logger.info(
                        "Progress: %d/%d (ins %d, upd %d) | %.1f/s | ETA %.1fs | last: %s",
                        stats.processed,
                        stats.total_files,
                        stats.inserted,
                        stats.updated,
                        rate,
                        eta,
                        ", ".join(last_seen),
                    )

                batch_map.clear()

            for entry_path in files:
                entry = parse_dictionary_file(entry_path)
                batch_map[(entry.headword, entry.meaning_id)] = entry  # de-dupe within batch
                last_seen.append(f"{entry.headword}#{entry.meaning_id}")
                stats.processed += 1

                if len(batch_map) >= batch_size:
                    flush_batch()

            flush_batch()

    elapsed = time.time() - start_time if stats.total_files else 0
    logger.info(
        "Finished: %d files in %.1fs (ins %d, upd %d; NT2 linked %d, skipped %d)",
        stats.total_files,
        elapsed,
        stats.inserted,
        stats.updated,
        stats.nt2_linked,
        stats.nt2_skipped,
    )

    return stats
