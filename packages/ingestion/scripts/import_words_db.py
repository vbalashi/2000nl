from __future__ import annotations

import argparse
import logging
import os
import sys

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from importer.core import import_entries

# Try to load .env.local if python-dotenv is installed
try:
    from dotenv import load_dotenv
    load_dotenv(".env.local")
except ImportError:
    pass

DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/dictionary"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import Dutch dictionary JSON files into Postgres."
    )
    parser.add_argument(
        "--data-dir",
        "-d",
        required=True,
        help="Path to the folder that contains the JSON dictionary entries.",
    )
    parser.add_argument(
        "--database-url",
        "-u",
        default=os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL),
        help="Postgres connection string (env DATABASE_URL overrides default).",
    )
    parser.add_argument(
        "--language",
        "-l",
        default="nl",
        help="Language code for the imported entries.",
    )
    parser.add_argument(
        "--language-name",
        default="Dutch",
        help="Human readable language name stored in the languages table.",
    )
    parser.add_argument(
        "--list-slug",
        default="nt2-2000",
        help="Slug used for the NT2 word list.",
    )
    parser.add_argument(
        "--list-name",
        default="VanDale 2k",
        help="Name used for the NT2 word list.",
    )
    parser.add_argument(
        "--list-description",
        default="Core 2000 woorden voor NT2",
        help="Description stored with the NT2 word list.",
    )
    parser.add_argument(
        "--dictionary-slug",
        default="nl-vandale",
        help="Slug of the dictionary that owns imported entries.",
    )
    parser.add_argument(
        "--dictionary-name",
        default="VanDale Dutch",
        help="Name of the dictionary that owns imported entries.",
    )
    parser.add_argument(
        "--dictionary-description",
        default="Trusted Dutch VanDale-backed dictionary used by the current 2000nl training app.",
        help="Description of the dictionary that owns imported entries.",
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

    if not args.database_url:
        parser.error("database URL must be provided either through --database-url or DATABASE_URL")

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(message)s",
        handlers=[
            logging.FileHandler("import.log", mode="w"),
            logging.StreamHandler()
        ]
    )
    stats = import_entries(
        data_dir=args.data_dir,
        database_url=args.database_url,
        language_code=args.language,
        language_name=args.language_name,
        nt2_slug=args.list_slug,
        nt2_name=args.list_name,
        nt2_description=args.list_description,
        dictionary_slug=args.dictionary_slug,
        dictionary_name=args.dictionary_name,
        dictionary_description=args.dictionary_description,
        dictionary_schema_key=args.dictionary_schema_key,
        dictionary_schema_version=args.dictionary_schema_version,
    )

    logging.info(
        "Processed %d files (%d inserted, %d updated); NT2 list gained %d entries (%d skipped).",
        stats.total_files,
        stats.inserted,
        stats.updated,
        stats.nt2_linked,
        stats.nt2_skipped,
    )


if __name__ == "__main__":
    main()
