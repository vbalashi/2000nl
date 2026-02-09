#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


def parse_ts(s: str | None) -> datetime | None:
    if not s:
        return None
    # Supabase returns ISO-8601 with timezone, usually "+00:00".
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


@dataclass(frozen=True)
class Row:
    id: str
    reviewed_at: datetime
    scheduled_at: datetime | None
    word_id: str
    headword: str | None
    mode: str
    review_type: str
    grade: int
    interval_after: float | None
    stability_before: float | None
    stability_after: float | None
    difficulty_before: float | None
    difficulty_after: float | None
    params_version: str | None
    metadata: dict[str, Any]


def load_rows(p: Path) -> list[Row]:
    raw = json.loads(p.read_text())
    out: list[Row] = []
    for r in raw:
        out.append(
            Row(
                id=r["id"],
                reviewed_at=parse_ts(r["reviewed_at"]) or datetime.min,
                scheduled_at=parse_ts(r.get("scheduled_at")),
                word_id=r["word_id"],
                headword=(r.get("word_entries") or {}).get("headword"),
                mode=r["mode"],
                review_type=r["review_type"],
                grade=int(r["grade"]),
                interval_after=float(r["interval_after"]) if r.get("interval_after") is not None else None,
                stability_before=float(r["stability_before"]) if r.get("stability_before") is not None else None,
                stability_after=float(r["stability_after"]) if r.get("stability_after") is not None else None,
                difficulty_before=float(r["difficulty_before"]) if r.get("difficulty_before") is not None else None,
                difficulty_after=float(r["difficulty_after"]) if r.get("difficulty_after") is not None else None,
                params_version=r.get("params_version"),
                metadata=r.get("metadata") or {},
            )
        )
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate a markdown report from Supabase user_review_log JSON export.")
    ap.add_argument("--in", dest="in_path", required=True, help="Input JSON (array of user_review_log rows).")
    ap.add_argument("--out", dest="out_path", required=True, help="Output markdown path.")
    ap.add_argument("--repeat-seconds", type=int, default=120, help="Threshold for 'repeat' detection.")
    args = ap.parse_args()

    rows = load_rows(Path(args.in_path))
    rows.sort(key=lambda r: (r.word_id, r.mode, r.reviewed_at))

    by: dict[tuple[str, str], list[Row]] = defaultdict(list)
    for r in rows:
        by[(r.word_id, r.mode)].append(r)

    repeats: list[tuple[float, Row, Row]] = []
    repeats_same_grade_interval_diff: list[tuple[float, Row, Row]] = []

    for (wid, mode), lst in by.items():
        lst.sort(key=lambda r: r.reviewed_at)
        for i in range(1, len(lst)):
            a, b = lst[i - 1], lst[i]
            dt = (b.reviewed_at - a.reviewed_at).total_seconds()
            if dt < args.repeat_seconds:
                repeats.append((dt, a, b))
                if (
                    a.grade == b.grade
                    and a.interval_after is not None
                    and b.interval_after is not None
                    and abs(a.interval_after - b.interval_after) > (60.0 / 86400.0)  # > 1 minute in days
                ):
                    repeats_same_grade_interval_diff.append((dt, a, b))

    top = Counter()
    for dt, a, b in repeats:
        top[(a.headword or a.word_id, a.mode)] += 1

    def grade_label(g: int) -> str:
        return {1: "again", 2: "hard", 3: "good", 4: "easy"}.get(g, str(g))

    def fmt_row(r: Row) -> str:
        meta = r.metadata or {}
        ed = meta.get("elapsed_days")
        retr = meta.get("retrievability")
        same_day = meta.get("same_day")
        lrb = meta.get("last_reviewed_at_before")
        return (
            f"- `reviewed_at`: {r.reviewed_at.isoformat()}\n"
            f"- `scheduled_at`: {r.scheduled_at.isoformat() if r.scheduled_at else 'null'}\n"
            f"- `word`: {r.headword or '(unknown)'}\n"
            f"- `word_id`: {r.word_id}\n"
            f"- `mode`: {r.mode}\n"
            f"- `review_type`: {r.review_type}\n"
            f"- `grade`: {r.grade} ({grade_label(r.grade)})\n"
            f"- `interval_after`: {r.interval_after}\n"
            f"- `stability_before/after`: {r.stability_before} -> {r.stability_after}\n"
            f"- `difficulty_before/after`: {r.difficulty_before} -> {r.difficulty_after}\n"
            f"- `params_version`: {r.params_version}\n"
            f"- `metadata.elapsed_days`: {ed}\n"
            f"- `metadata.retrievability`: {retr}\n"
            f"- `metadata.same_day`: {same_day}\n"
            f"- `metadata.last_reviewed_at_before`: {lrb}\n"
        )

    # Build markdown
    out_lines: list[str] = []
    out_lines.append("# SRS History Anomaly Report")
    out_lines.append("")
    out_lines.append(f"- rows analyzed: {len(rows)}")
    out_lines.append(f"- unique (word_id, mode): {len(by)}")
    out_lines.append(f"- repeats under {args.repeat_seconds}s: {len(repeats)}")
    out_lines.append(
        f"- repeats under {args.repeat_seconds}s with same grade but different interval_after (>1 min): {len(repeats_same_grade_interval_diff)}"
    )
    out_lines.append("")
    out_lines.append("## Top Repeats (word, mode)")
    out_lines.append("")
    for (hw, mode), n in top.most_common(15):
        out_lines.append(f"- {n}x: `{hw}` ({mode})")
    out_lines.append("")

    out_lines.append(f"## Fast Repeats (first 25, dt < {args.repeat_seconds}s)")
    out_lines.append("")
    for dt, a, b in sorted(repeats, key=lambda t: t[0])[:25]:
        out_lines.append(f"### {a.headword or a.word_id} ({a.mode}) dt={dt:.3f}s")
        out_lines.append("")
        out_lines.append("A:")
        out_lines.append(fmt_row(a))
        out_lines.append("B:")
        out_lines.append(fmt_row(b))
        out_lines.append("")

    Path(args.out_path).write_text("\n".join(out_lines) + "\n")


if __name__ == "__main__":
    main()

