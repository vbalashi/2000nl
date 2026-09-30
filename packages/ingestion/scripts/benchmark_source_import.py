"""Full-corpus initial/no-op/one-entry update in an owned disposable local DB."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
from urllib.parse import urlparse, urlunparse
from uuid import uuid4

import psycopg2
from psycopg2 import sql

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from importer.core import import_entries  # noqa: E402


def changed_corpus(source: Path, target: Path) -> None:
    """Modify only the benchmark's private copy and regenerate its checksums."""
    shutil.copytree(source, target)
    manifest_path = target / "_manifest.jsonl"
    records = [json.loads(line) for line in manifest_path.read_text().splitlines()]
    for record in records:
        path = target / record["artifact_path"]
        payload = json.loads(path.read_text(encoding="utf-8"))
        meanings = payload[0].get("meanings", [])
        if meanings and isinstance(meanings[0].get("definition"), str):
            meanings[0]["definition"] += " [benchmark changed definition]"
            path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            record["content_sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
            break
    else:
        raise ValueError("Corpus has no definition suitable for the update benchmark")
    manifest_path.write_text(
        "".join(json.dumps(record, sort_keys=True) + "\n" for record in records),
        encoding="utf-8",
    )
    summary_path = target / "_manifest.summary.json"
    summary = json.loads(summary_path.read_text())
    summary["manifest_sha256"] = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    summary_path.write_text(json.dumps(summary), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--local-database-url", default=
                        "postgresql://postgres:postgres@127.0.0.1:54322/postgres")
    args = parser.parse_args()
    parsed = urlparse(args.local_database_url)
    if (parsed.scheme not in {"postgres", "postgresql"}
            or parsed.hostname not in {"localhost", "127.0.0.1", "::1"}
            or not parsed.port or parsed.query or parsed.fragment):
        parser.error("Benchmark requires a loopback URL with explicit port and no overrides")
    repo = Path(__file__).resolve().parents[3]
    database_name = "source_benchmark_" + uuid4().hex
    database_url = urlunparse(parsed._replace(path="/" + database_name))
    maintenance = psycopg2.connect(args.local_database_url)
    maintenance.autocommit = True
    created = False
    try:
        with maintenance.cursor() as cursor:
            cursor.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database_name)))
        created = True
        subprocess.run([
            "psql", database_url, "-v", "ON_ERROR_STOP=1",
            "-f", "db/scripts/plain_postgres_supabase_compat.sql",
            "-f", "db/migrations/bootstrap.sql",
        ], cwd=repo, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=True)
        with TemporaryDirectory(prefix="source-import-benchmark-") as scratch:
            updated_dir = Path(scratch) / "changed"
            changed_corpus(args.data_dir, updated_dir)
            for label, data_dir in (("initial", args.data_dir),
                                    ("no_op", args.data_dir),
                                    ("one_entry_changed", updated_dir)):
                started = time.monotonic()
                stats = import_entries(data_dir=data_dir, database_url=database_url)
                seconds = time.monotonic() - started
                print(json.dumps({
                    "case": label, "seconds": round(seconds, 3),
                    "entries": stats.processed, "changed": stats.changed,
                    "no_op": stats.no_op, "stages": stats.stage_metrics,
                }), flush=True)
                if label == "one_entry_changed":
                    assert stats.changed == 1
                    assert stats.stage_metrics["reconciled_entries"] == 1
                    assert stats.stage_metrics["word_rows_written"] == 1
                budget = 15 if label == "no_op" else 60
                assert seconds <= budget, f"{label}: {seconds:.2f}s exceeds {budget}s budget"
        with psycopg2.connect(database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT (SELECT count(*) FROM private.source_entry_bindings
                            WHERE binding_state = 'active'),
                           (SELECT count(*) FROM private.platform_v2_content_nodes
                            WHERE binding_state = 'active'),
                           (SELECT count(*) FROM private.unrenderable_ordinary_direct_entries_v1)
                """)
                print(json.dumps({"final_counts": cursor.fetchone()}), flush=True)
    finally:
        if created:
            with maintenance.cursor() as cursor:
                cursor.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(
                    sql.Identifier(database_name)))
        maintenance.close()


if __name__ == "__main__":
    main()
