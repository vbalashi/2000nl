#!/usr/bin/env python3
"""
Fixed parser with proper idiom/expression handling.
"""
import json
from bs4 import BeautifulSoup
import re


def _normalize_part_of_speech(raw: str) -> str:
    """
    Map various Dutch part‑of‑speech labels/abbreviations to short codes.
    We care most that verbs become 'ww' so verb_forms logic can trigger.
    """
    if not raw:
        return ""

    text = raw.strip().lower().strip("().;:, ")

    # Verb
    if "werkwoord" in text or re.search(r"\bww\b", text):
        return "ww"

    # Noun
    if "zelfstandig naamwoord" in text or re.search(r"\bznw?\b", text) or re.search(
        r"\bzn\b", text
    ):
        return "zn"

    # Adverb
    if "bijwoord" in text or re.search(r"\bbw\b", text):
        return "bw"

    # Preposition
    if "voorzetsel" in text or re.search(r"\bvz\b", text):
        return "vz"

    # Adjective (keep a separate code; only used for display)
    if "bijvoeglijk naamwoord" in text:
        return "bn"

    # Pronoun / preposition / conjunction / numeral / article / abbrev
    if "voornaamwoord" in text or re.search(r"\bvnw\b", text):
        return "vnw"
    if "voorzetsel" in text or re.search(r"\bvz\b", text):
        return "vz"
    if "voegwoord" in text or text == "vw":
        return "vw"
    if "telwoord" in text or text in {"tw", "telw"}:
        return "tw"
    if "lidwoord" in text or text == "lidw":
        return "lidw"
    if "afkorting" in text or text == "afk":
        return "afk"
    if "voorvoegsel" in text or text in {"vv", "vvs"}:
        return "vv"

    # Fallback: return cleaned inner text
    return ""


def parse_conjugation_table(soup):
    """Parse the werkwoordrijtje (verb conjugation table) from Van Dale HTML.
    
    Returns a dict with present, past, and perfect tense conjugations, or None if not found.
    """
    # Find the hidden conjugation table span (id starts with "ww")
    conjugation_span = soup.find("span", id=lambda x: x and x.startswith("ww") and x != "ww")
    if not conjugation_span:
        return None
    
    # Find the table inside
    table = conjugation_span.find("table", class_="Nt2FLti")
    if not table:
        return None
    
    conjugation = {
        "present": {},
        "past": {},
        "perfect": {}
    }
    
    # Parse table rows
    rows = table.find_all("tr")
    
    # Map for pronoun keys (normalize to valid Python dict keys)
    pronoun_map = {
        "ik": "ik",
        "dat ik": "dat_ik",
        "jij": "jij",
        "dat jij": "dat_jij",
        "u": "u",
        "dat u": "dat_u",
        "hij/zij/het": "hij_zij_het",
        "dat hij/zij/het": "dat_hij_zij_het",
        "wij": "wij",
        "dat wij": "dat_wij",
        "jullie": "jullie",
        "dat jullie": "dat_jullie",
        "zij": "zij",
        "dat zij": "dat_zij"
    }
    
    # Track if we've passed the separator row (indicates perfect tense section)
    past_separator = False
    
    for row in rows:
        cells = row.find_all("td")
        if len(cells) < 1:
            continue
        
        # Check for separator row (colspan=4, empty content)
        if len(cells) == 1 and cells[0].get('colspan'):
            past_separator = True
        
        # Need at least 2 cells for meaningful data
        if len(cells) < 2:
            continue
        
        
        # Get text from cells
        cell_texts = [cell.get_text(strip=True) for cell in cells]
        
        # Skip header rows
        if not cell_texts[0] or any(header in cell_texts[0].lower() for header in ["onvoltooid", "tegenwoordige", "verleden", "tijd"]):
            continue
        
        # After separator, we're in the perfect tense section
        if past_separator:
            # Look for "hulpwerkwoord" and "voltooid deelwoord" headers
            if len(cell_texts) >= 2 and "hulpwerkwoord" in cell_texts[1].lower():
                continue
            if len(cell_texts) >= 3 and "voltooid" in cell_texts[2].lower():
                continue
            
            # This should be the actual perfect tense row
            if len(cells) >= 3:
                auxiliary = cells[1].get_text(strip=True)
                participle = cells[2].get_text(strip=True)
                if auxiliary and participle:
                    conjugation["perfect"]["auxiliary"] = auxiliary
                    conjugation["perfect"]["participle"] = participle
            continue
        
        # Regular conjugation rows (present and past)
        pronoun_text = cell_texts[0]
        
        # Map pronoun to key
        pronoun_key = pronoun_map.get(pronoun_text)
        if not pronoun_key:
            continue
        
        # Get present and past forms
        if len(cells) >= 2:
            present_form = cells[1].get_text(strip=True)
            if present_form:
                conjugation["present"][pronoun_key] = present_form
        
        if len(cells) >= 3:
            past_form = cells[2].get_text(strip=True)
            if past_form:
                conjugation["past"][pronoun_key] = past_form
    
    # Only return if we found some conjugations
    if conjugation["present"] or conjugation["past"] or conjugation["perfect"]:
        return conjugation
    
    return None



def parse_vandale_entry_fixed(content_html, headword_html=None):
    """Parse Van Dale HTML with all features."""
    soup = BeautifulSoup(content_html, "html.parser")
    
    entry = {
        "headword": "",
        "pronunciation": "",
        "pronunciation_with_stress": "",
        "gender": "",
        "part_of_speech": "",
        "plural": "",
        "diminutive": "",  # verkleinwoord
        "verb_forms": "",
        "conjugation_table": None,  # werkwoordrijtje
        "inflected_form": "", # verbogen vorm (adj)
        "comparative": "",    # vergrotende trap (adj)
        "superlative": "",    # overtreffende trap (adj)
        "derivations": "",     # afleiding (derived words)
        "alternate_headwords": [],  # secondary gendered variants in the headword line
        "cross_reference": None,  # "zie [word]" references
        "is_nt2_2000": False,
        "meanings": [],
        "audio_links": {"nl": None, "be": None},
        "images": [],
    }
    
    # NT2-2000 marker
    marker = soup.find('span', class_='f3j')
    if marker and marker.get_text(strip=True) == '•':
        entry["is_nt2_2000"] = True
    
    # Gender
    gender_span = soup.find("span", class_="f2f")
    if gender_span:
        entry["gender"] = gender_span.get_text(strip=True)
    
    # Headword and pronunciation
    # Headword and pronunciation
    headword_span = soup.find("span", class_="f2h")
    if headword_span:
        text_parts = []
        syllables = []
        current_syllable = ""
        stressed_in_current = False
        for child in headword_span.children:
            # Stop if we hit an audio link or the start of form info (parenthesis)
            if child.name == 'a':
                break
            if child.name == 'span' and 'f1k' in child.get('class', []):
                break
            # Skip NT2 marker (dot)
            if child.name == 'span' and 'f3j' in child.get('class', []):
                continue
            # Skip superscript/variant numbers (f1p)
            if child.name == 'span' and 'f1p' in child.get('class', []):
                continue
                
            cls = child.get('class', []) if hasattr(child, "get") else []
            text = child.get_text(strip=True) if hasattr(child, "get_text") else (child.strip() if isinstance(child, str) else "")
            if not text:
                continue
            text_parts.append(text)

            is_stressed = 'f1e' in cls  # f1e spans carry the stressed vowel
            for ch in text:
                if ch == "·":
                    if current_syllable:
                        syllables.append((current_syllable, stressed_in_current))
                    current_syllable = ""
                    stressed_in_current = False
                    continue
                current_syllable += ch
                stressed_in_current = stressed_in_current or is_stressed

        if current_syllable:
            syllables.append((current_syllable, stressed_in_current))
        
        full_text = " ".join(filter(None, text_parts))
        # Clean up: remove extra spaces around dots if any (though usually they are inside spans)
        # The text might be like "aa n·kij·ken op" -> "aan·kij·ken op"
        # Actually, the spans usually split it like "aa" + "n·kij·ken op", so joining with space is wrong if they are adjacent parts of a word
        # But "op" is a separate word.
        
        # Better approach: join with empty string, but respect spaces that were explicitly there?
        # In the HTML: <span class="f1e">aa</span><span class="f2e">n·kij·ken op</span>
        # There is NO space between them.
        # But there IS a space before audio links: <span class="f1l"> </span>
        
        # Let's try joining with empty string, but if a part starts with space or we skipped a space span, we might lose it.
        # However, looking at the structure:
        # f1e: "aa"
        # f2e: "n·kij·ken op"
        # So simple concatenation works for the word itself.
        
        full_text = "".join(text_parts).strip()
        
        if full_text:
            entry["pronunciation"] = full_text
            entry["headword"] = full_text.replace("·", "")

        if syllables:
            stressed_repr = []
            stress_added = False
            for syl, stressed in syllables:
                if stressed and not stress_added:
                    stressed_repr.append("ˈ" + syl)
                    stress_added = True
                else:
                    stressed_repr.append(syl)
            entry["pronunciation_with_stress"] = "·".join(stressed_repr)

    # Capture additional gendered headwords listed in the headword block (e.g. de ... , de ...)
    headword_block = soup.find("span", class_="f3v")
    if headword_block:
        variants = []
        current_variant = None
        collecting_plural = False
        for child in headword_block.descendants:
            if not hasattr(child, "get"):
                continue
            classes = child.get("class", [])
            text = child.get_text(strip=True)

            if "f2f" in classes:  # gender marker starts a new variant
                if current_variant and current_variant.get("pronunciation_parts"):
                    variants.append(current_variant)
                current_variant = {
                    "gender": text,
                    "pronunciation_parts": [],
                    "plural_parts": [],
                }
                collecting_plural = False
                continue

            if not current_variant:
                continue

            # Collect pronunciation fragments
            if "f2e" in classes or "f1e" in classes:
                if text and text not in {",", ";"}:
                    current_variant["pronunciation_parts"].append(text)

            # Detect plural label and start collecting f1k values
            if "f1v" in classes and "meervoud" in text.lower():
                collecting_plural = True
                continue

            if collecting_plural and "f1k" in classes:
                if text and text not in {")", "(", ";", ",", ":"}:
                    current_variant["plural_parts"].append(text)
                continue

            # Stop plural collection at next label
            if collecting_plural and "f1v" in classes:
                collecting_plural = False

        # Flush last variant
        if current_variant and current_variant.get("pronunciation_parts"):
            variants.append(current_variant)

        normalized_variants = []
        for var in variants:
            pron = "".join(var.get("pronunciation_parts", [])).strip().rstrip(",;")
            if not pron:
                continue
            normalized_variants.append(
                {
                    "headword": pron.replace("·", ""),
                    "pronunciation": pron,
                    "gender": var.get("gender", ""),
                    "plural": ", ".join(var.get("plural_parts", [])).strip(),
                }
            )

        if normalized_variants:
            primary = normalized_variants[0]
            entry["headword"] = primary.get("headword", entry["headword"])
            entry["pronunciation"] = primary.get("pronunciation", entry["pronunciation"])
            entry["gender"] = primary.get("gender", entry["gender"])
            if primary.get("plural"):
                entry["plural"] = primary["plural"]
            entry["alternate_headwords"] = normalized_variants[1:]
    
    # Part of speech – try several strategies, then normalise
    pos_text = ""

    # 0) Prefer explicit POS from the separate headword HTML, if provided by the API
    #    e.g. "bestaan<sup>2</sup> <i>(ww)</i>" or "... <i>(zn)</i>"
    if headword_html:
        hw_soup = BeautifulSoup(headword_html, "html.parser")
        i_tag = hw_soup.find("i")
        if i_tag:
            txt = i_tag.get_text(" ", strip=True)
            if txt:
                m = re.search(r"\(([^)]+)\)", txt)
                pos_text = (m.group(1).strip() if m else txt.strip())

    # 1) Look for dedicated POS span(s) in the article HTML.
    # Restrict to known POS keywords to avoid picking up usage labels (e.g. percentages).
    if not pos_text:
        for span in soup.find_all("span", class_="f1k"):
            text = span.get_text(" ", strip=True)
            if not text:
                continue

            # Most entries put POS inside parentheses, e.g. "(zn.)", "(werkwoord)"
            m = re.search(r"\(([^)]+)\)", text)
            candidate = m.group(1).strip() if m else text.strip()
            normalized = _normalize_part_of_speech(candidate)
            if normalized:
                pos_text = candidate
                break

    # 2) Very conservative fallback on raw HTML: only match known POS codes/labels
    if not pos_text:
        m = re.search(
            r"\((ww|znw?|zn|bw|bn|vz|werkwoord|zelfstandig naamwoord|bijvoeglijk naamwoord|bijwoord|voorzetsel)\)",
            content_html,
            re.IGNORECASE,
        )
        if m:
            pos_text = m.group(1).strip()

    # 3) Heuristic: Check for "werkwoordrijtje" link
    if not pos_text:
        if soup.find("a", class_="f3g", string="werkwoordrijtje"):
            pos_text = "ww"

    if pos_text:
        entry["part_of_speech"] = _normalize_part_of_speech(pos_text)
    # 4) Heuristic: if we still don't know POS but we have a gender, it's a noun.
    elif entry["gender"] in {"de", "het"} or any(g in (entry["gender"] or "") for g in ["de", "het"]):
        entry["part_of_speech"] = "zn"
    
    # 5) Heuristic: Check for prefix/suffix based on hyphen
    if not entry["part_of_speech"]:
        hw_clean = entry["headword"].strip()
        if hw_clean.endswith('-') and len(hw_clean) > 1:
            entry["part_of_speech"] = "vv"
        elif hw_clean.startswith('-') and len(hw_clean) > 1:
             entry["part_of_speech"] = "achtervoegsel"

    # 6) Heuristics to fill remaining blanks (common empty cases)
    if not entry["part_of_speech"]:
        hw = entry["headword"].strip()
        hw_lower = hw.lower()

        # Proper noun heuristic: capitalized single token without spaces/slashes
        if re.match(r"^[A-ZÁÀÂÄÅÃÆÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜÇÑ][^\\s/]*$", hw):
            entry["part_of_speech"] = "zn"

        # Adjective heuristic: has comparative/superlative/inflected form captured
        if not entry["part_of_speech"] and any(
            entry.get(k) for k in ("comparative", "superlative", "inflected_form")
        ):
            entry["part_of_speech"] = "bn"

        # Noun heuristic: plural captured
        if not entry["part_of_speech"] and entry.get("plural"):
            entry["part_of_speech"] = "zn"

        # Function-word mappings
        TW = {
            "nul","een","twee","drie","vier","vijf","zes","zeven","acht","negen","tien",
            "elf","twaalf","dertien","veertien","vijftien","zestien","zeventien","achttien","negentien","twintig",
        }
        VW = {"en","of","opdat","doordat","want","maar","dus"}
        VNW = {"ze","jullie","diens","dele","hij","zij","ik","wij","u","je"}

        if not entry["part_of_speech"] and hw_lower in TW:
            entry["part_of_speech"] = "tw"
        if not entry["part_of_speech"] and hw_lower in VW:
            entry["part_of_speech"] = "vw"
        if not entry["part_of_speech"] and hw_lower in VNW:
            entry["part_of_speech"] = "vnw"
    
    # Cross-reference detection (e.g., "zie aanzien")
    # Look for <span class="f1v">zie</span> followed by a link
    zie_spans = soup.find_all('span', class_='f1v')
    for zie_span in zie_spans:
        zie_text = zie_span.get_text(strip=True).lower()
        if zie_text in ['zie', 'see']:
            # Find the next link
            next_link = zie_span.find_next_sibling('a')
            if next_link:
                ref_word = next_link.get_text(strip=True)
                if ref_word:
                    entry["cross_reference"] = ref_word
                    break
    
    # Plural and diminutive (for nouns)
    form_spans = soup.find_all("span", class_="f1v")
    for span in form_spans:
        text = span.get_text()
        
        # Collect all consecutive f1k spans after the label
        # Stop when we hit another f1v label or certain punctuation
        values = []
        current = span.next_sibling
        while current:
            # Skip text nodes
            if isinstance(current, str):
                current = current.next_sibling
                continue
            
            # Check if it's an f1v span (another label) - stop here
            if hasattr(current, 'get') and current.get('class'):
                if 'f1v' in current.get('class', []):
                    break
            
            # Only process f1k spans
            if hasattr(current, 'get') and 'f1k' in current.get('class', []):
                val = current.get_text(strip=True)
                # Stop at closing parenthesis or semicolon
                if val in [')', '(', ';']:
                    break
                # Skip punctuation-only spans and empty spans
                if val and val not in [',', ':']:
                    values.append(val)
            
            current = current.next_sibling
        
        if not values:
            continue
        
        # Join multiple values with comma
        value = ', '.join(values)
        
        if "meervoud:" in text:
            if not entry["plural"]:
                entry["plural"] = value
            else:
                # If plural already captured (e.g., alternate gender), attach to alternates when possible
                if entry["alternate_headwords"]:
                    entry["alternate_headwords"][0]["plural"] = entry["alternate_headwords"][0].get("plural") or value
        elif "verkleinwoord:" in text:
            entry["diminutive"] = value
        elif "verbogen vorm:" in text:
            entry["inflected_form"] = value
        elif "vergrotende trap:" in text:
            entry["comparative"] = value
        elif "overtreffende trap:" in text:
            entry["superlative"] = value
        elif "afleiding:" in text:
            entry["derivations"] = value
    
    # Verb forms (for verbs)
    # Strategy 1: Look for explicit conjugation spans in f1k (e.g. "beval aan, heeft aanbevolen")
    # These often appear right after the headword/pronunciation, before any f1v labels
    # These often appear right after the headword/pronunciation, before any f1v labels
    if entry["part_of_speech"] == "ww":
        # Limit scope to the headword block (f3v) to avoid capturing examples in meanings (f3u)
        headword_block = soup.find("span", class_="f3v")
        if headword_block:
            # Find the opening parenthesis and collect f1k spans until we hit an f1v label or semicolon
            filtered_f1k = []
            found_opening = False
            
            for child in headword_block.descendants:
                if not hasattr(child, 'get'):
                    continue
                    
                classes = child.get('class', [])
                
                # Look for opening parenthesis
                if 'f1k' in classes:
                    text = child.get_text(strip=True)
                    if text == '(':
                        found_opening = True
                        continue
                    
                    if found_opening:
                        # Stop at semicolon (indicates start of other fields like afleiding)
                        if text == ';':
                            break
                        # Stop at closing parenthesis
                        if text == ')':
                            break
                        # Skip commas and other punctuation
                        if text in [',', ':']:
                            continue
                        # Skip "werkwoord" label
                        if "werkwoord" in text or text == "ww":
                            continue
                        filtered_f1k.append(text)
                
                # Stop if we encounter an f1v label (like "afleiding:")
                if 'f1v' in classes and found_opening:
                    break
                
            if filtered_f1k and not entry["verb_forms"]:
                entry["verb_forms"] = ", ".join(filtered_f1k)

    # Strategy 2: Old logic (fallback)
    if entry["part_of_speech"] == "ww" and not entry["verb_forms"] and headword_span:
        verb_spans = headword_span.find_all("span", class_="f1k")
        verb_parts = []
        for vf in verb_spans:
            text = vf.get_text(strip=True)
            if not text or text in {"(", ")", ","}:
                continue
            verb_parts.append(text)

        if verb_parts:
            entry["verb_forms"] = ", ".join(verb_parts)
    
    # Parse conjugation table (werkwoordrijtje) for verbs
    if entry["part_of_speech"] == "ww":
        conjugation = parse_conjugation_table(soup)
        if conjugation:
            entry["conjugation_table"] = conjugation
    
    # Meanings
    meaning_blocks = soup.find_all("span", class_="f3u")
    
    for block in meaning_blocks:
        meaning = {
            "definition": "",
            "context": "",
            "examples": [],
            "idioms": []  # Idioms/expressions with explanations
        }
        
        # Main definition - extract from f1m span to include links and reference numbers
        # but exclude the examples section (f2s spans) and idiom blocks
        f1m_span = block.find("span", class_="f1m")
        if f1m_span:
            # Check if there's a main definition (f3i NOT inside an idiom block)
            # Idiom blocks are marked with f0c or f1f classes
            main_def_span = None
            for f3i in f1m_span.find_all("span", class_="f3i"):
                # Check if this f3i is inside an idiom block
                is_in_idiom = False
                for parent in f3i.parents:
                    if parent == f1m_span:
                        break
                    if hasattr(parent, 'get') and parent.get('class'):
                        if 'f0c' in parent.get('class', []) or 'f1f' in parent.get('class', []):
                            is_in_idiom = True
                            break
                
                if not is_in_idiom:
                    main_def_span = f3i
                    break
            
            # If we found a main definition (not in idiom), extract it
            if main_def_span:
                # Clone the f1m span to avoid modifying the original
                def_content = f1m_span.__copy__()
                
                # Remove example spans (f2s class) and the "voorbeelden" link
                for unwanted in def_content.find_all("span", class_="f2s"):
                    unwanted.decompose()
                for unwanted in def_content.find_all("a", class_="f0h"):
                    unwanted.decompose()
                
                # Remove idiom blocks (f0c spans)
                for unwanted in def_content.find_all("span", class_="f0c"):
                    unwanted.decompose()
                
                # Remove bracketed context (f0j spans containing brackets)
                for f0j in def_content.find_all("span", class_="f0j"):
                    f1l_texts = [s.get_text(strip=True) for s in f0j.find_all("span", class_="f1l")]
                    if '[' in f1l_texts and ']' in f1l_texts:
                        f0j.decompose()
                
                # Get the text, which now includes link text and reference numbers
                definition_text = def_content.get_text(" ", strip=True)
                # Clean up extra spaces and stray spaces before punctuation
                definition_text = re.sub(r'\s+', ' ', definition_text)
                definition_text = re.sub(r'\s+([,.;:])', r'\1', definition_text)
                meaning["definition"] = definition_text
            
            # Fallback: if no f3i found, but f1m exists (e.g. for abbreviations like a.u.b.)
            # Extract text from f1m directly, excluding unwanted parts
            elif not main_def_span:
                def_content = f1m_span.__copy__()
                
                # Remove example spans (f2s class) and the "voorbeelden" link
                for unwanted in def_content.find_all("span", class_="f2s"):
                    unwanted.decompose()
                for unwanted in def_content.find_all("a", class_="f0h"):
                    unwanted.decompose()
                
                # Remove idiom blocks (f0c spans)
                for unwanted in def_content.find_all("span", class_="f0c"):
                    unwanted.decompose()
                
                # Remove bracketed context (f0j spans containing brackets)
                for f0j in def_content.find_all("span", class_="f0j"):
                    f1l_texts = [s.get_text(strip=True) for s in f0j.find_all("span", class_="f1l")]
                    if '[' in f1l_texts and ']' in f1l_texts:
                        f0j.decompose()
                        
                definition_text = def_content.get_text(" ", strip=True)
                definition_text = re.sub(r'\s+', ' ', definition_text)
                definition_text = re.sub(r'\s+([,.;:])', r'\1', definition_text)
                if definition_text.strip():
                    meaning["definition"] = definition_text
        
        # Context (bracketed text) - extract from f0j spans that contain brackets
        # Look for pattern: <span class="f0j"><span class="f1l">[</span>...<span class="f1l">]</span></span>
        f0j_spans = block.find_all("span", class_="f0j")
        for f0j in f0j_spans:
            # Check if this span contains brackets
            f1l_texts = [s.get_text(strip=True) for s in f0j.find_all("span", class_="f1l")]
            if '[' in f1l_texts and ']' in f1l_texts:
                # This is a bracketed context - extract the content between brackets
                context_text = f0j.get_text(" ", strip=True)
                # Remove the brackets themselves
                context_text = context_text.strip('[]').strip()
                if context_text:
                    meaning["context"] = context_text
                    break
        
        # Regular examples
        example_spans = block.find_all("span", class_="f2s")
        for ex_span in example_spans:
            example_text = ex_span.get_text(strip=True)
            if example_text:
                meaning["examples"].append(example_text)
        
        # Idioms/expressions (nested in class f0c or f1f)
        idiom_blocks = block.find_all("span", class_="f0c")
        for idiom_block in idiom_blocks:
            idiom = {}
            
            # Idiom text
            idiom_span = idiom_block.find("span", class_="f3i")
            if idiom_span:
                idiom["expression"] = idiom_span.get_text(strip=True)
            
            # Explanation
            expl_span = idiom_block.find("span", class_="f3n")
            if expl_span:
                idiom["explanation"] = expl_span.get_text(strip=True)
            
            if idiom:
                meaning["idioms"].append(idiom)
        
        # Only add if we have a definition or idioms
        if meaning["definition"] or meaning["idioms"]:
            entry["meanings"].append(meaning)
    
    # Audio
    audio_links = soup.find_all("a", class_="audiofile")
    for link in audio_links:
        href = link.get("href", "")
        if "/nl/" in href:
            entry["audio_links"]["nl"] = href
        elif "/be/" in href:
            entry["audio_links"]["be"] = href
    
    # Images
    images = soup.find_all("img")
    for img in images:
        src = img.get('src', '')
        if src and 'http' in src:
            entry["images"].append(src)
    
    return entry

# Test
if __name__ == "__main__":
    # Test with blok
    with open('vandale_data/words/blok.json', 'r') as f:
        data = json.load(f)
    
    html = data[0]['_raw_html']
    parsed = parse_vandale_entry_fixed(html)
    
    print("=== BLOK - FIXED PARSING ===\n")
    print(f"Headword: {parsed['headword']}")
    print(f"Plural: {parsed['plural']}")
    print(f"Diminutive: {parsed['diminutive']}")
    print(f"\nMeanings: {len(parsed['meanings'])}\n")
    
    for i, m in enumerate(parsed['meanings'], 1):
        print(f"{i}. {m['definition']}")
        if m['examples']:
            print(f"   Examples: {m['examples']}")
        if m['idioms']:
            print(f"   Idioms:")
            for idiom in m['idioms']:
                print(f"     • {idiom.get('expression', '')}")
                if 'explanation' in idiom:
                    print(f"       → {idiom['explanation']}")
        print()
