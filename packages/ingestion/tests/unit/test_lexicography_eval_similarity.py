from __future__ import annotations

from pathlib import Path
import sys


INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))

from lexicography_eval.similarity import (  # noqa: E402
    SourceText,
    scan_candidate_against_sources,
)


def test_similarity_firewall_hard_fails_reused_examples_and_long_spans() -> None:
    sources = [
        SourceText(
            source_hash="source-one",
            field="example",
            text="Na het werk zet Amir iedere vrijdag een deel van zijn loon op de bank.",
        ),
        SourceText(
            source_hash="source-two",
            field="definition",
            text="Een instelling die geld voor klanten bewaart en leningen aan hen geeft.",
        ),
    ]
    candidate = {
        "content": {
            "senses": [
                {
                    "definition": "Een bedrijf dat geld voor klanten bewaart en leningen aan hen geeft.",
                    "examples": [
                        "Na het werk zet Amir iedere vrijdag een deel van zijn loon op de bank."
                    ],
                    "collocations": [],
                    "synonyms": [],
                    "idioms": [],
                }
            ]
        }
    }

    result = scan_candidate_against_sources(candidate, sources)

    hard_codes = {flag.code for flag in result.flags if flag.hard}
    assert "exact_source_example" in hard_codes
    assert "continuous_source_span" in hard_codes
    assert result.hard_failure is True


def test_similarity_firewall_allows_semantically_close_independent_wording() -> None:
    sources = [
        SourceText(
            source_hash="source-one",
            field="definition",
            text="Een instelling die geld voor klanten bewaart en leningen aan hen geeft.",
        )
    ]
    candidate = {
        "content": {
            "senses": [
                {
                    "definition": "Bij dit bedrijf kun je geld op een rekening zetten of geld lenen.",
                    "examples": ["Mijn salaris komt elke maand op mijn rekening."],
                    "collocations": ["geld lenen"],
                    "synonyms": [],
                    "idioms": [],
                }
            ]
        }
    }

    result = scan_candidate_against_sources(candidate, sources)

    assert result.hard_failure is False
    assert not [flag for flag in result.flags if flag.hard]


def test_similarity_flags_short_exact_text_for_review_without_false_hard_failure() -> None:
    sources = [
        SourceText(source_hash="short", field="definition", text="heel erg moe")
    ]
    candidate = {
        "content": {
            "senses": [
                {
                    "definition": "heel erg moe",
                    "examples": [],
                    "collocations": [],
                    "synonyms": [],
                    "idioms": [],
                }
            ]
        }
    }

    result = scan_candidate_against_sources(candidate, sources)

    assert result.hard_failure is False
    assert {flag.code for flag in result.flags} == {"exact_short_source_text_review"}


def test_four_word_canonical_definition_is_review_only() -> None:
    sources = [
        SourceText(
            source_hash="canonical",
            field="definition",
            text="in de meeste gevallen",
        )
    ]
    candidate = {
        "content": {
            "senses": [
                {
                    "definition": "in de meeste gevallen",
                    "examples": [],
                    "collocations": [],
                    "synonyms": [],
                    "idioms": [],
                }
            ]
        }
    }

    result = scan_candidate_against_sources(candidate, sources)

    assert result.hard_failure is False
    assert {flag.code for flag in result.flags} == {
        "exact_short_source_text_review"
    }


def test_two_common_five_grams_are_review_only_when_no_eight_token_span() -> None:
    sources = [
        SourceText(
            source_hash="generic",
            field="definition",
            text="iemand die in een groot bedrijf werkt en vaak met andere mensen praat",
        )
    ]
    candidate = {
        "content": {
            "senses": [
                {
                    "definition": "iemand die in een groot bedrijf werkt maar zelden met andere mensen praat",
                    "examples": [],
                    "collocations": [],
                    "synonyms": [],
                    "idioms": [],
                }
            ]
        }
    }

    result = scan_candidate_against_sources(candidate, sources)

    assert not any(flag.code == "repeated_source_five_gram" and flag.hard for flag in result.flags)
