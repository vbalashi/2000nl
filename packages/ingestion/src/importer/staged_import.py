"""Transaction-local COPY transport for the private staged import boundary."""
from __future__ import annotations

import csv
from io import StringIO
import json
import time


def apply_staged_content(cursor, rows: list[dict]) -> dict:
    cursor.execute("select private.begin_staged_source_import_v1()")
    started = time.monotonic()
    buffer = StringIO()
    writer = csv.writer(buffer)
    for row in rows:
        writer.writerow([json.dumps(row, ensure_ascii=False)])
    buffer.seek(0)
    cursor.copy_expert(
        "COPY pg_temp.platform_v2_source_stage (payload) FROM STDIN WITH (FORMAT csv)",
        buffer,
    )
    copy_seconds = time.monotonic() - started
    cursor.execute("select private.apply_staged_source_import_v1()")
    result = cursor.fetchone()[0]
    result["copy_seconds"] = copy_seconds
    return result
