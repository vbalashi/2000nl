from __future__ import annotations

from typing import Any


def _string_list(
    value: Any, *, field: str, maximum: int, item_maximum: int = 300
) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > maximum:
        raise ValueError(f"Generated {field} must be an array with at most {maximum} items")
    result = []
    for item in value:
        if (
            not isinstance(item, str)
            or not item.strip()
            or len(item.strip()) > item_maximum
        ):
            raise ValueError(f"Generated {field} items must be non-empty strings")
        result.append(item.strip())
    return result


def _nullable_string(
    value: Any, *, field: str, maximum: int = 400
) -> str | None:
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise ValueError(f"Generated {field} must be a string or null")
    result = value.strip() or None
    if result is not None and len(result) > maximum:
        raise ValueError(f"Generated {field} is too long")
    return result


def _synonyms(value: Any) -> list[dict[str, str | None]]:
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > 4:
        raise ValueError("Generated synonyms must be an array with at most 4 items")
    result = []
    for item in value:
        if not isinstance(item, dict) or set(item) != {"term", "limitation"}:
            raise ValueError("Every generated synonym must use the closed synonym schema")
        term = item["term"]
        if not isinstance(term, str) or not term.strip() or len(term.strip()) > 120:
            raise ValueError("Every generated synonym needs a valid term")
        result.append(
            {
                "term": term.strip(),
                "limitation": _nullable_string(
                    item["limitation"], field="synonym limitation", maximum=300
                ),
            }
        )
    return result


def _idioms(value: Any) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > 4:
        raise ValueError("Generated idioms must be an array with at most 4 items")
    result = []
    for item in value:
        if not isinstance(item, dict) or set(item) != {
            "expression",
            "explanation",
            "examples",
        }:
            raise ValueError("Every generated idiom must use the closed idiom schema")
        expression = item["expression"]
        explanation = item["explanation"]
        if (
            not isinstance(expression, str)
            or not expression.strip()
            or len(expression.strip()) > 160
        ):
            raise ValueError("Every generated idiom needs a valid expression")
        if (
            not isinstance(explanation, str)
            or not explanation.strip()
            or len(explanation.strip()) > 400
        ):
            raise ValueError("Every generated idiom needs a valid explanation")
        examples = _string_list(
            item["examples"], field="idiom examples", maximum=2, item_maximum=300
        )
        if not examples:
            raise ValueError("Every generated idiom needs at least one example")
        result.append(
            {
                "expression": expression.strip(),
                "explanation": explanation.strip(),
                "examples": examples,
            }
        )
    return result


def validate_generated_content(
    payload: dict[str, Any],
    generation_input: dict[str, Any],
) -> dict[str, Any]:
    if not isinstance(payload, dict) or set(payload) != {
        "headword",
        "partOfSpeech",
        "senses",
    }:
        raise ValueError("Generated content must use the closed top-level schema")
    expected_headword_raw = generation_input.get("headword")
    expected_pos_raw = generation_input.get("partOfSpeech")
    if not isinstance(expected_headword_raw, str) or not isinstance(
        expected_pos_raw, str
    ):
        raise ValueError("Generation input needs string headword and partOfSpeech")
    expected_headword = expected_headword_raw.strip()
    expected_pos = expected_pos_raw.strip()
    headword_raw = payload.get("headword")
    part_of_speech_raw = payload.get("partOfSpeech")
    if not isinstance(headword_raw, str) or not isinstance(part_of_speech_raw, str):
        raise ValueError("Generated headword and partOfSpeech must be strings")
    headword = headword_raw.strip()
    part_of_speech = part_of_speech_raw.strip()
    if headword.casefold() != expected_headword.casefold():
        raise ValueError("Generated headword does not match generation input")
    if part_of_speech.casefold() != expected_pos.casefold():
        raise ValueError("Generated partOfSpeech does not match generation input")
    raw_senses = payload.get("senses")
    if not isinstance(raw_senses, list) or not 1 <= len(raw_senses) <= 8:
        raise ValueError("Generated senses must contain between one and eight items")

    senses = []
    for index, raw_sense in enumerate(raw_senses, start=1):
        if not isinstance(raw_sense, dict):
            raise ValueError("Every generated sense must be an object")
        expected_sense_fields = {
            "definition",
            "usageNote",
            "usagePattern",
            "examples",
            "collocations",
            "synonyms",
            "idioms",
        }
        if set(raw_sense) != expected_sense_fields:
            raise ValueError(
                f"Generated sense {index} contains missing or unsupported fields"
            )
        raw_definition = raw_sense.get("definition")
        if not isinstance(raw_definition, str):
            raise ValueError(f"Generated sense {index} definition must be a string")
        definition = raw_definition.strip()
        if not definition or len(definition) > 600:
            raise ValueError(f"Generated sense {index} has an invalid definition")
        raw_examples = raw_sense.get("examples")
        if not isinstance(raw_examples, list) or len(raw_examples) != 2:
            raise ValueError(f"Generated sense {index} needs exactly two examples")
        examples = _string_list(raw_examples, field="examples", maximum=2)
        senses.append(
            {
                "definition": definition,
                "usageNote": _nullable_string(
                    raw_sense.get("usageNote"), field="usageNote"
                ),
                "usagePattern": _nullable_string(
                    raw_sense.get("usagePattern"), field="usagePattern"
                ),
                "examples": examples,
                "collocations": _string_list(
                    raw_sense.get("collocations"), field="collocations", maximum=6
                ),
                "synonyms": _synonyms(raw_sense.get("synonyms")),
                "idioms": _idioms(raw_sense.get("idioms")),
            }
        )
    return {
        "headword": headword,
        "partOfSpeech": part_of_speech,
        "senses": senses,
    }


def apply_output_policy(
    content: dict[str, Any], *, force_empty_optional_fields: bool
) -> dict[str, Any]:
    if not force_empty_optional_fields:
        return content
    return {
        **content,
        "senses": [
            {
                **sense,
                "usageNote": None,
                "usagePattern": None,
                "collocations": [],
                "synonyms": [],
                "idioms": [],
            }
            for sense in content["senses"]
        ],
    }
