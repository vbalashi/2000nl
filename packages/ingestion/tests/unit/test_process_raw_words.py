from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys


REPO_ROOT = Path(__file__).resolve().parents[4]
PROCESS_SCRIPT = REPO_ROOT / "packages/ingestion/scripts/process_raw_words.py"
SCRAPER_ROOT = REPO_ROOT / "packages/scraper"


def _named_article(article_id: str, headword: str, definition: str) -> str:
    return f"""
    <span id="{article_id}" class="f1y">
      <span class="f3 f3v">
        <span class="f2h"><span class="f2e">{headword}</span></span>
      </span>
      <span class="f3 f3u">
        <span class="f1m"><span class="f3i">{definition}</span></span>
      </span>
    </span>
    """


def _article(article_id: str, definition: str) -> str:
    return _named_article(article_id, "aan·pas·sen", definition)


def test_cli_keeps_same_headword_homographs_as_separate_artifacts(
    tmp_path: Path,
) -> None:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    source = [
        {
            "headword": "aanpassen<sup>1</sup> <i>(ww)</i>",
            "content": _article("a113", "geschikt maken"),
            "dictionaryId": "fnt",
            "index": 99,
        },
        {
            "headword": "aanpassen<sup>2</sup> <i>(ww)</i>",
            "content": _article(
                "a114",
                "doen wat anderen verwachten",
            ),
            "dictionaryId": "fnt",
            "index": 100,
        },
    ]
    (data_dir / "word_list.json").write_text(
        json.dumps(source, ensure_ascii=False),
        encoding="utf-8",
    )
    environment = {
        **os.environ,
        "PYTHONPATH": str(SCRAPER_ROOT),
    }

    subprocess.run(
        [sys.executable, str(PROCESS_SCRIPT)],
        cwd=tmp_path,
        env=environment,
        check=True,
        capture_output=True,
        text=True,
    )

    output_dir = data_dir / "words_content"
    artifact_paths = sorted(
        path
        for path in output_dir.glob("*.json")
        if not path.name.startswith("_")
    )
    assert [path.name for path in artifact_paths] == [
        "000099_a113_aanpassen_ww_1.json",
        "000100_a114_aanpassen_ww_1.json",
    ]

    payloads = [
        json.loads(path.read_text(encoding="utf-8"))[0]
        for path in artifact_paths
    ]
    group_keys = [
        payload["_source"]["source_group_key"] for payload in payloads
    ]
    assert len(set(group_keys)) == 2
    assert all(
        key.startswith("fnt:vandale-provider-article-v1:")
        for key in group_keys
    )
    assert [
        payload["_source"]["source_entry_key"] for payload in payloads
    ] == [f"{key}:1" for key in group_keys]
    assert all(
        payload["_source"]["normalized_pos_status"] == "known"
        for payload in payloads
    )
    assert all(
        payload["_source"]["pos_evidence"]["source"] == "headword_html"
        for payload in payloads
    )


def test_cli_writes_deterministic_source_manifest(tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "word_list.json").write_text(
        json.dumps(
            [
                {
                    "headword": "aanpassen<sup>1</sup> <i>(ww)</i>",
                    "content": _article("a113", "geschikt maken"),
                    "dictionaryId": "fnt",
                    "index": 99,
                }
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    subprocess.run(
        [sys.executable, str(PROCESS_SCRIPT)],
        cwd=tmp_path,
        env={**os.environ, "PYTHONPATH": str(SCRAPER_ROOT)},
        check=True,
        capture_output=True,
        text=True,
    )

    manifest_path = data_dir / "words_content" / "_manifest.jsonl"
    records = [
        json.loads(line)
        for line in manifest_path.read_text(encoding="utf-8").splitlines()
    ]
    assert records == [
        {
            "artifact_path": "000099_a113_aanpassen_ww_1.json",
            "content_sha256": records[0]["content_sha256"],
            "identity_scheme_version": "vandale-provider-article-v1",
            "source_entry_key": records[0]["source_entry_key"],
            "source_group_key": records[0]["source_group_key"],
        }
    ]
    assert len(records[0]["content_sha256"]) == 64
    assert records[0]["source_entry_key"] == (
        f"{records[0]['source_group_key']}:1"
    )
    summary = json.loads(
        (data_dir / "words_content" / "_manifest.summary.json").read_text(
            encoding="utf-8"
        )
    )
    assert summary == {
        "artifact_count": 1,
        "artifact_format_version": "vandale-structured-v2",
        "identity_scheme_version": "vandale-provider-article-v1",
        "input_sha256": summary["input_sha256"],
        "manifest_sha256": summary["manifest_sha256"],
        "source_record_count": 1,
    }
    assert len(summary["input_sha256"]) == 64
    assert len(summary["manifest_sha256"]) == 64


def test_cli_disambiguates_reused_provider_article_ids(tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    (data_dir / "word_list.json").write_text(
        json.dumps(
            [
                {
                    "headword": "Bermuda",
                    "content": _named_article(
                        "a200025",
                        "Ber·mu·da",
                        "land in Amerika",
                    ),
                    "dictionaryId": "fnt",
                    "index": 1282,
                },
                {
                    "headword": "burgerservicenummer",
                    "content": _named_article(
                        "a200025",
                        "bur·ger·ser·vi·ce·num·mer",
                        "persoonlijk registratienummer",
                    ),
                    "dictionaryId": "fnt",
                    "index": 2059,
                },
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    subprocess.run(
        [sys.executable, str(PROCESS_SCRIPT)],
        cwd=tmp_path,
        env={**os.environ, "PYTHONPATH": str(SCRAPER_ROOT)},
        check=True,
        capture_output=True,
        text=True,
    )

    records = [
        json.loads(line)
        for line in (
            data_dir / "words_content" / "_manifest.jsonl"
        ).read_text(encoding="utf-8").splitlines()
    ]
    assert len(records) == 2
    assert len({record["source_group_key"] for record in records}) == 2
    assert len({record["source_entry_key"] for record in records}) == 2


def test_cli_refuses_to_mix_a_new_run_with_existing_output(
    tmp_path: Path,
) -> None:
    source_path = tmp_path / "source.json"
    output_dir = tmp_path / "generated"
    output_dir.mkdir()
    (output_dir / "stale.json").write_text("{}", encoding="utf-8")
    source_path.write_text(
        json.dumps(
            [
                {
                    "headword": "aanpassen <i>(ww)</i>",
                    "content": _article("a113", "geschikt maken"),
                    "dictionaryId": "fnt",
                    "index": 99,
                }
            ]
        ),
        encoding="utf-8",
    )

    result = subprocess.run(
        [
            sys.executable,
            str(PROCESS_SCRIPT),
            "--input",
            str(source_path),
            "--output-dir",
            str(output_dir),
        ],
        cwd=tmp_path,
        env={**os.environ, "PYTHONPATH": str(SCRAPER_ROOT)},
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "must be empty" in result.stderr
    assert (output_dir / "stale.json").read_text(encoding="utf-8") == "{}"


def test_cli_promotes_only_resolvable_pointer_only_meanings(
    tmp_path: Path,
) -> None:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    pointer_article = """
    <span id="a2476" class="f1y">
      <span class="f3 f3v">
        <span class="f2h"><span class="f2e">daar</span></span>
      </span>
      <span class="f3 f3u">
        <span class="f1m"><span class="f3i">op die plaats</span></span>
      </span>
      <span class="f3 f3u">
        <span class="f1m"><span class="f3i">daar-</span></span>
      </span>
    </span>
    """
    target_article = """
    <span id="a2478" class="f1y">
      <span class="f3 f3v">
        <span class="f2h"><span class="f2e">daar-</span></span>
      </span>
      <span class="f3 f3u">
        <span class="f1m">
          <span class="f3i">samen met een voorzetsel gebruikt</span>
          <span class="f2s"><span class="f1k">wat bedoel je daarmee?</span></span>
        </span>
      </span>
    </span>
    """
    hyphenated_literal = _named_article(
        "a3000",
        "koppel-teken",
        "een niet-lege definitie met een koppelteken",
    )
    (data_dir / "word_list.json").write_text(
        json.dumps(
            [
                {
                    "headword": "daar<sup>1</sup> <i>(bw)</i>",
                    "content": pointer_article,
                    "dictionaryId": "fnt",
                    "index": 2506,
                },
                {
                    "headword": "daar-",
                    "content": target_article,
                    "dictionaryId": "fnt",
                    "index": 2508,
                },
                {
                    "headword": "koppelteken <i>(zn)</i>",
                    "content": hyphenated_literal,
                    "dictionaryId": "fnt",
                    "index": 3000,
                },
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    subprocess.run(
        [sys.executable, str(PROCESS_SCRIPT)],
        cwd=tmp_path,
        env={**os.environ, "PYTHONPATH": str(SCRAPER_ROOT)},
        check=True,
        capture_output=True,
        text=True,
    )

    output_dir = data_dir / "words_content"
    pointer = json.loads(
        next(output_dir.glob("*_daar_bw_2.json")).read_text(encoding="utf-8")
    )[0]
    target = json.loads(
        next(output_dir.glob("*_daar-_vv_1.json")).read_text(encoding="utf-8")
    )[0]
    literal = json.loads(
        next(output_dir.glob("*_koppelteken_zn_1.json")).read_text(
            encoding="utf-8"
        )
    )[0]

    assert pointer["cross_reference"] == "daar-"
    assert pointer["meanings"] == []
    assert target["cross_reference"] is None
    assert target["meanings"][0]["definition"] == (
        "samen met een voorzetsel gebruikt"
    )
    assert target["meanings"][0]["examples"] == ["wat bedoel je daarmee?"]
    assert literal["cross_reference"] is None
    assert literal["meanings"][0]["definition"] == (
        "een niet-lege definitie met een koppelteken"
    )
