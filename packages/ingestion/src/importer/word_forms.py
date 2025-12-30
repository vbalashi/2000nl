from __future__ import annotations

import re
from typing import Any, Iterable, Set


_AUXILIARIES = {
    "ben",
    "bent",
    "bened",
    "heb",
    "hebt",
    "heeft",
    "hebben",
    "had",
    "hadden",
    "is",
    "was",
    "waren",
    "word",
    "wordt",
    "werden",
}


def _normalize_form(value: str | None) -> str | None:
    if not value:
        return None

    cleaned = value.replace("·", " ").replace("∙", " ").strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = cleaned.strip(" ,;.")
    if not cleaned:
        return None

    normalized = cleaned.lower()
    if len(normalized) < 2:
        return None

    return normalized


def _split_candidates(value: Any) -> Iterable[str]:
    if value is None:
        return []

    if isinstance(value, list):
        for item in value:
            yield from _split_candidates(item)
        return

    if isinstance(value, (int, float)):
        normalized = str(value).strip()
        if normalized:
            yield normalized
        return

    if isinstance(value, str):
        # Split on common separators but keep hyphens/apostrophes intact.
        for part in re.split(r"[,;/]", value):
            candidate = part.strip()
            if candidate:
                yield candidate
        return

    yield str(value)


def _strip_auxiliary(text: str) -> str:
    parts = text.split()
    if len(parts) >= 2 and parts[0].lower() in _AUXILIARIES:
        return " ".join(parts[1:])
    return text


def extract_word_forms(entry: dict) -> Set[str]:
    """
    Extract a set of inflected or related forms for a dictionary entry.

    The output is normalized (lower-cased, trimmed, punctuation removed)
    and excludes empty/short fragments.
    """

    forms: Set[str] = set()

    def add(value: Any):
        for candidate in _split_candidates(value):
            normalized = _normalize_form(candidate)
            if normalized:
                forms.add(normalized)

    headword = entry.get("headword")
    add(headword)

    metadata = entry.get("_metadata") or {}
    add(metadata.get("headword_raw"))
    add(metadata.get("search_term"))

    add(entry.get("inflected_form"))
    add(entry.get("plural"))
    add(entry.get("diminutive"))
    add(entry.get("comparative"))
    add(entry.get("superlative"))

    alternate = entry.get("alternate_headwords")
    if alternate:
        add(alternate)

    verb_forms = entry.get("verb_forms")
    if verb_forms:
        candidates = []
        for raw in _split_candidates(verb_forms):
            cleaned = _strip_auxiliary(raw)
            # If something like "is weggegaan", also capture the final token
            parts = cleaned.split()
            if parts:
                candidates.append(parts[-1])
            candidates.append(cleaned)
        add(candidates)

    conjugations = entry.get("conjugation_table") or {}
    if isinstance(conjugations, dict):
        for tense_values in conjugations.values():
            if not isinstance(tense_values, dict):
                add(tense_values)
                continue
            for person, value in tense_values.items():
                # Auxiliary is not a form of the word itself (heeft/is)
                if person == "auxiliary":
                    continue
                add(value)

    return forms


