#!/usr/bin/env python3
"""
Process raw words from data/word_list.json and save parsed content to data/words_content/.
"""
import json
import re
from copy import deepcopy
from pathlib import Path

from vandale_html_parser import parse_vandale_entry_fixed

INPUT_FILE = Path("data/word_list.json")
OUTPUT_DIR = Path("data/words_content")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

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

def process_words():
    if not INPUT_FILE.exists():
        print(f"Input file {INPUT_FILE} not found.")
        return

    with open(INPUT_FILE, 'r') as f:
        word_list = json.load(f)
    
    print(f"Loaded {len(word_list)} words from {INPUT_FILE}")
    
    saved_count = 0
    
    for i, raw_data in enumerate(word_list):
        headword = raw_data.get('headword')
        content = raw_data.get('content')
        
        if not headword or not content:
            print(f"Skipping index {i}: missing headword or content")
            continue
            
        # Parse
        parsed = parse_vandale_entry_fixed(content, headword)
        parsed = normalize_headword_and_pronunciation(parsed)
        
        # Add metadata
        parsed['_metadata'] = {
            'search_term': headword,
            'headword_raw': headword,
            'index': raw_data.get('index'),
            'dictionaryId': raw_data.get('dictionaryId')
        }
        parsed['_raw_html'] = content
        
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

                filename = f"{base_word}_{pos_label}_{meaning_id}.json"
                output_file = OUTPUT_DIR / filename
                with open(output_file, 'w', encoding='utf-8') as out_f:
                    json.dump([entry_copy], out_f, indent=2, ensure_ascii=False)
                saved_count += 1
        else:
            entry_copy = deepcopy(parsed)
            entry_copy["meanings"] = meanings if meanings != [None] else []
            entry_copy["meaning_id"] = 1

            filename = f"{base_word}_{pos_label}_1.json"
            output_file = OUTPUT_DIR / filename
            with open(output_file, 'w', encoding='utf-8') as out_f:
                json.dump([entry_copy], out_f, indent=2, ensure_ascii=False)
            saved_count += 1

    print(f"Processed {len(word_list)} items. Saved/Updated {saved_count} entries in {OUTPUT_DIR}")

if __name__ == "__main__":
    process_words()
