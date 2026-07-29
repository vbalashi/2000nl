from __future__ import annotations

from pathlib import Path
from typing import Optional

from importer.source_import import (
    SourceImportStats,
    import_source_manifest,
)


ImportStats = SourceImportStats


def import_entries(
    data_dir: Path | str,
    database_url: str,
    language_code: str = "nl",
    language_name: str = "Dutch",
    nt2_slug: str = "nt2-2000",
    nt2_name: str = "VanDale 2k",
    nt2_description: Optional[str] = "Core 2000 woorden voor NT2",
    dictionary_slug: str = "nl-vandale",
    dictionary_name: str = "VanDale Dutch",
    dictionary_description: Optional[str] = (
        "Trusted Dutch VanDale-backed dictionary used by the current "
        "2000nl training app."
    ),
    dictionary_schema_key: str = "nl-vandale-v2",
    dictionary_schema_version: int = 1,
    refresh_search_documents: bool = False,
    reconciliation_plan: Path | str | None = None,
) -> SourceImportStats:
    path = Path(data_dir)
    if not path.exists():
        raise FileNotFoundError(f"{path} does not exist")
    if not (path / "_manifest.jsonl").is_file():
        raise RuntimeError(
            "Source-managed imports require a versioned _manifest.jsonl; "
            "legacy natural-key writes are not supported"
        )

    return import_source_manifest(
        data_dir=path,
        database_url=database_url,
        reconciliation_plan=reconciliation_plan,
        language_code=language_code,
        language_name=language_name,
        nt2_slug=nt2_slug,
        nt2_name=nt2_name,
        nt2_description=nt2_description,
        dictionary_slug=dictionary_slug,
        dictionary_name=dictionary_name,
        dictionary_description=dictionary_description,
        dictionary_schema_key=dictionary_schema_key,
        dictionary_schema_version=dictionary_schema_version,
        refresh_search_documents=refresh_search_documents,
    )
