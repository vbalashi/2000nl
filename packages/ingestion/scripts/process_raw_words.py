#!/usr/bin/env python3
"""
Process raw words from data/word_list.json and save parsed content to data/words_content/.
"""
import argparse
import hashlib
import json
import re
import sys
from copy import deepcopy
from pathlib import Path

sys.path.insert(
    0,
    str(Path(__file__).resolve().parents[2] / "scraper"),
)
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from vandale_html_parser import parse_vandale_entry_fixed
from importer.pointer_meanings import promote_resolvable_pointer_only_meaning

INPUT_FILE = Path("data/word_list.json")
OUTPUT_DIR = Path("data/words_content")
IDENTITY_SCHEME_VERSION = "vandale-provider-article-v1"
ARTIFACT_FORMAT_VERSION = "vandale-structured-v2"

# Split entries with multiple meanings into separate files so they can be
# browsed one definition at a time.
SPLIT_MEANINGS = True

def sanitize_filename(name):
    """Sanitize filename to avoid issues with special characters."""
    # Replace slashes and other dangerous chars
    safe_name = re.sub(r'[\\/*?:"<>|]', "_", name)
    return safe_name


def normalize_headword_and_pronunciation(entry: dict) -> dict:
    """
    Some parsed headwords include bracketed pronunciation fragments
    (e.g. 'chloor[gloor]'). Strip the brackets from the headword and, if
    present, move the inner text into pronunciation.
    """
    headword = entry.get("headword") or ""
    if "[" in headword and "]" in headword:
        base = headword.split("[", 1)[0].strip()
        pron_fragment = headword.split("[", 1)[1].split("]", 1)[0].strip()
        if base:
            entry["headword"] = base
        if pron_fragment:
            entry["pronunciation"] = pron_fragment
    return entry


def extract_clean_filename(headword, parsed_pos):
    """
    Extract a clean filename from headword.
    For entries like "aan<sup>1</sup> <i>(bw)</i>", extract base word and POS.
    Returns: (base_word, pos_suffix)
    """
    # Remove HTML tags to get clean text
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(headword, 'html.parser')
    
    # Remove superscript tags (they contain variant numbers like 1, 2, etc.)
    for sup in soup.find_all('sup'):
        sup.decompose()
    
    clean = soup.get_text()
    
    # Pattern: "word word (pos)" or just "word word"
    # Extract base word (which may contain spaces) and POS if present
    match = re.match(r'^([^(]+?)(?:\s*\(([^)]+)\))?\s*$', clean)
    if match:
        base_word = match.group(1).strip()
        pos_in_headword = match.group(2)
        
        # Replace spaces with underscores for filename
        base_word = base_word.replace(' ', '_')
        base_word = sanitize_filename(base_word)
        
        # If there's a POS in the headword, use it
        if pos_in_headword:
            # Clean up the POS (remove dots, etc.)
            pos_clean = pos_in_headword.strip().rstrip('.')
            pos_clean = sanitize_filename(pos_clean)
            return base_word, pos_clean
        
        # Otherwise, use the parsed POS if available
        if parsed_pos:
            return base_word, sanitize_filename(parsed_pos)
    
    # Fallback: sanitize the whole thing
    return sanitize_filename(clean.replace(' ', '_')), None

def _source_identity(parsed: dict, raw_data: dict, meaning_id: int) -> dict:
    evidence = parsed.get("source_identity") or {}
    pos_evidence = parsed.get("part_of_speech_evidence") or {
        "normalized_pos_status": "unresolved",
        "source": "missing",
        "raw_value": "",
    }
    provider_article_id = evidence.get("provider_article_id")
    if not provider_article_id:
        raise ValueError(
            f"Missing provider article id for source index {raw_data.get('index')}"
        )

    dictionary_id = raw_data.get("dictionaryId")
    if not dictionary_id:
        raise ValueError(
            f"Missing dictionaryId for provider article {provider_article_id}"
        )

    source_index = raw_data.get("index")
    if not isinstance(source_index, int):
        raise ValueError(
            f"Missing integer source index for provider article {provider_article_id}"
        )

    identity_evidence = {
        "dictionary_id": dictionary_id,
        "headword_raw": re.sub(
            r"\s+",
            " ",
            raw_data.get("headword") or "",
        ).strip(),
        "provider_article_id": provider_article_id,
    }
    homograph_number = evidence.get("homograph_number")
    if homograph_number is not None:
        identity_evidence["homograph_number"] = homograph_number
    evidence_bytes = json.dumps(
        identity_evidence,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    evidence_digest = hashlib.sha256(evidence_bytes).hexdigest()[:32]
    source_group_key = (
        f"{dictionary_id}:{IDENTITY_SCHEME_VERSION}:{evidence_digest}"
    )
    identity = {
        "identity_scheme_version": IDENTITY_SCHEME_VERSION,
        "identity_evidence": identity_evidence,
        "provider_article_id": provider_article_id,
        "normalized_pos_status": pos_evidence["normalized_pos_status"],
        "pos_evidence": pos_evidence,
        "source_group_key": source_group_key,
        "source_entry_key": f"{source_group_key}:{meaning_id}",
        "source_index": source_index,
        "sense_ordinal": meaning_id,
    }
    if homograph_number is not None:
        identity["homograph_number"] = homograph_number
    return identity


def _manifest_record(output_file: Path, output_dir: Path, source: dict) -> dict:
    return {
        "artifact_path": output_file.relative_to(output_dir).as_posix(),
        "content_sha256": hashlib.sha256(output_file.read_bytes()).hexdigest(),
        "identity_scheme_version": source["identity_scheme_version"],
        "source_entry_key": source["source_entry_key"],
        "source_group_key": source["source_group_key"],
    }


def process_words(input_file: Path = INPUT_FILE, output_dir: Path = OUTPUT_DIR):
    if not input_file.exists():
        raise FileNotFoundError(f"Input file {input_file} not found")
    if output_dir.exists() and any(output_dir.iterdir()):
        raise ValueError(f"Output directory {output_dir} must be empty")
    output_dir.mkdir(parents=True, exist_ok=True)

    with open(input_file, "r", encoding="utf-8") as f:
        word_list = json.load(f)
    
    print(f"Loaded {len(word_list)} words from {input_file}")
    
    parsed_records = []
    for i, raw_data in enumerate(word_list):
        headword = raw_data.get('headword')
        content = raw_data.get('content')

        if not headword or not content:
            print(f"Skipping index {i}: missing headword or content")
            continue

        parsed = normalize_headword_and_pronunciation(
            parse_vandale_entry_fixed(content, headword)
        )
        parsed['_metadata'] = {
            'search_term': headword,
            'headword_raw': headword,
            'index': raw_data.get('index'),
            'dictionaryId': raw_data.get('dictionaryId')
        }
        parsed['_raw_html'] = content
        parsed_records.append((raw_data, headword, parsed))

    available_headwords = {
        parsed["headword"].strip()
        for _, _, parsed in parsed_records
        if isinstance(parsed.get("headword"), str) and parsed["headword"].strip()
    }

    saved_count = 0
    seen_source_entry_keys = set()
    seen_output_paths = set()
    manifest_records = []

    for raw_data, headword, parsed in parsed_records:
        # Save
        base_word, pos_suffix = extract_clean_filename(headword, parsed.get('part_of_speech'))
        pos_label = sanitize_filename(pos_suffix or parsed.get('part_of_speech') or "nopos")

        meanings = parsed.get("meanings") or []
        if not meanings:
            meanings = [None]

        if SPLIT_MEANINGS and len(meanings) > 1:
            for meaning_id, meaning in enumerate(meanings, 1):
                entry_copy = deepcopy(parsed)
                entry_copy["meanings"] = [] if meaning is None else [meaning]
                entry_copy["meaning_id"] = meaning_id
                promote_resolvable_pointer_only_meaning(
                    entry_copy,
                    available_headwords,
                )
                entry_copy["_source"] = _source_identity(
                    parsed,
                    raw_data,
                    meaning_id,
                )

                article_id = entry_copy["_source"]["provider_article_id"]
                source_index = entry_copy["_source"]["source_index"]
                filename = (
                    f"{source_index:06d}_{sanitize_filename(article_id)}_"
                    f"{base_word}_{pos_label}_{meaning_id}.json"
                )
                output_file = output_dir / filename
                source_entry_key = entry_copy["_source"]["source_entry_key"]
                if source_entry_key in seen_source_entry_keys:
                    raise ValueError(f"Duplicate source entry key: {source_entry_key}")
                if output_file in seen_output_paths:
                    raise ValueError(f"Duplicate output path: {output_file}")
                seen_source_entry_keys.add(source_entry_key)
                seen_output_paths.add(output_file)
                with open(output_file, 'w', encoding='utf-8') as out_f:
                    json.dump([entry_copy], out_f, indent=2, ensure_ascii=False)
                manifest_records.append(
                    _manifest_record(output_file, output_dir, entry_copy["_source"])
                )
                saved_count += 1
        else:
            entry_copy = deepcopy(parsed)
            entry_copy["meanings"] = meanings if meanings != [None] else []
            entry_copy["meaning_id"] = 1
            promote_resolvable_pointer_only_meaning(
                entry_copy,
                available_headwords,
            )
            entry_copy["_source"] = _source_identity(parsed, raw_data, 1)

            article_id = entry_copy["_source"]["provider_article_id"]
            source_index = entry_copy["_source"]["source_index"]
            filename = (
                f"{source_index:06d}_{sanitize_filename(article_id)}_"
                f"{base_word}_{pos_label}_1.json"
            )
            output_file = output_dir / filename
            source_entry_key = entry_copy["_source"]["source_entry_key"]
            if source_entry_key in seen_source_entry_keys:
                raise ValueError(f"Duplicate source entry key: {source_entry_key}")
            if output_file in seen_output_paths:
                raise ValueError(f"Duplicate output path: {output_file}")
            seen_source_entry_keys.add(source_entry_key)
            seen_output_paths.add(output_file)
            with open(output_file, 'w', encoding='utf-8') as out_f:
                json.dump([entry_copy], out_f, indent=2, ensure_ascii=False)
            manifest_records.append(
                _manifest_record(output_file, output_dir, entry_copy["_source"])
            )
            saved_count += 1

    manifest_path = output_dir / "_manifest.jsonl"
    manifest_path.write_text(
        "".join(
            json.dumps(
                record,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            )
            + "\n"
            for record in sorted(
                manifest_records,
                key=lambda record: record["artifact_path"],
            )
        ),
        encoding="utf-8",
    )
    summary = {
        "artifact_count": saved_count,
        "artifact_format_version": ARTIFACT_FORMAT_VERSION,
        "identity_scheme_version": IDENTITY_SCHEME_VERSION,
        "input_sha256": hashlib.sha256(input_file.read_bytes()).hexdigest(),
        "manifest_sha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
        "source_record_count": len(word_list),
    }
    (output_dir / "_manifest.summary.json").write_text(
        json.dumps(
            summary,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )

    print(
        f"Processed {len(word_list)} items. "
        f"Saved/Updated {saved_count} entries in {output_dir}"
    )

def main():
    parser = argparse.ArgumentParser(
        description="Generate structured, collision-safe Van Dale artifacts."
    )
    parser.add_argument("--input", type=Path, default=INPUT_FILE)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    arguments = parser.parse_args()
    process_words(arguments.input, arguments.output_dir)


if __name__ == "__main__":
    main()
