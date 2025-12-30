import subprocess
import time
from pathlib import Path

import psycopg2
import pytest

from importer.core import import_entries

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = PROJECT_ROOT / "tests" / "fixtures" / "sample_words"
TEST_DB_NAME = "dictionary_test"
ADMIN_DB_URL = "postgresql://postgres:postgres@localhost:5432/postgres"
DB_URL = f"postgresql://postgres:postgres@localhost:5432/{TEST_DB_NAME}"


def _wait_for_database(timeout: float = 10.0) -> None:
    start = time.time()
    while True:
        try:
            with psycopg2.connect(ADMIN_DB_URL):
                return
        except psycopg2.OperationalError:
            if time.time() - start > timeout:
                raise
            time.sleep(0.5)


def _create_database() -> None:
    connection = psycopg2.connect(ADMIN_DB_URL)
    connection.autocommit = True
    try:
        with connection.cursor() as cursor:
            cursor.execute(f"drop database if exists {TEST_DB_NAME}")
            cursor.execute(f"create database {TEST_DB_NAME}")
    finally:
        connection.close()


def _drop_database() -> None:
    connection = psycopg2.connect(ADMIN_DB_URL)
    connection.autocommit = True
    try:
        with connection.cursor() as cursor:
            cursor.execute(f"drop database if exists {TEST_DB_NAME}")
    finally:
        connection.close()


def _apply_migrations(connection: psycopg2.extensions.connection) -> None:
    migrations = sorted((PROJECT_ROOT / "migrations").glob("*.sql"))
    with connection.cursor() as cursor:
        for migration in migrations:
            cursor.execute(migration.read_text())
    connection.commit()


@pytest.fixture(scope="module", autouse=True)
def docker_postgres():
    started = False
    try:
        subprocess.check_call(
            ["docker", "compose", "up", "-d", "postgres"],
            cwd=PROJECT_ROOT,
        )
        started = True
    except subprocess.CalledProcessError as exc:
        pytest.skip(f"Unable to start docker compose: {exc}")

    try:
        _wait_for_database()
        _drop_database()
        _create_database()
        yield
    finally:
        if started:
            subprocess.check_call(
                ["docker", "compose", "down"],
                cwd=PROJECT_ROOT,
            )


def test_importer_loads_entries_and_is_idempotent(docker_postgres):
    with psycopg2.connect(DB_URL) as connection:
        _apply_migrations(connection)

    first_run = import_entries(
        data_dir=FIXTURE_DIR,
        database_url=DB_URL,
    )
    assert first_run.inserted == 5
    assert first_run.nt2_linked == 3
    assert first_run.nt2_skipped == 0

    second_run = import_entries(
        data_dir=FIXTURE_DIR,
        database_url=DB_URL,
    )
    assert second_run.inserted == 0
    assert second_run.updated == 5
    assert second_run.nt2_linked == 0
    assert second_run.nt2_skipped == 3

    with psycopg2.connect(DB_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute("select count(*) from word_entries")
            assert cursor.fetchone()[0] == 5

            cursor.execute("select raw from word_entries where headword = %s", ("aan",))
            raw_entry = cursor.fetchone()[0]
            assert raw_entry["headword"] == "aan"
            assert raw_entry["meanings"][0]["idioms"][0]["expression"] == "het is aan tussen hen"

            cursor.execute("select count(*) from word_list_items")
            assert cursor.fetchone()[0] == 3

            cursor.execute(
                "select meaning_id, raw->>'meaning_id' from word_entries where headword = %s order by meaning_id",
                ("ergens",),
            )
            rows = cursor.fetchall()
            assert [row[0] for row in rows] == [1, 2]
            assert [row[1] for row in rows] == ["1", "2"]
