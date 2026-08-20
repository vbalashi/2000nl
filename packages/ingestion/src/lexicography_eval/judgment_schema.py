from __future__ import annotations

from typing import Any


JUDGMENT_SCHEMA = "lexicography-judgment-v1"
QUALITY_SCORE_KEYS = (
    "naturalness",
    "learnerUsefulness",
    "definitionClarity",
    "exampleQuality",
    "grammarAccuracy",
)
FIDELITY_SCORE_KEYS = (
    "senseCoverage",
    "senseDiscrimination",
    "independentWording",
)
ALLOWED_ERROR_CODES = {
    "wrong_sense",
    "missing_common_sense",
    "merged_senses",
    "split_sense",
    "wrong_register",
    "unnatural_example",
    "invented_idiom",
    "grammar_error",
    "morphology_error",
    "valency_error",
    "circular_definition",
    "too_difficult",
    "synonym_overclaim",
    "regional_hallucination",
    "suspicious_copy",
    "uncertain_optional_claim",
}
CLAIM_VERDICTS = {"supported", "uncertain", "false"}
ALLOWED_HARD_FAILURES = {
    "wrong_target_pos",
    "semantic_contradiction",
    "invented_idiom",
    "invalid_dutch",
    "source_reproduction",
    "unsupported_optional_claim",
    "invalid_valency",
    "wrong_register",
    "regional_hallucination",
}
IMPLIED_HARD_FAILURES = {
    "wrong_sense": "semantic_contradiction",
    "grammar_error": "invalid_dutch",
    "morphology_error": "invalid_dutch",
    "invented_idiom": "invented_idiom",
    "valency_error": "invalid_valency",
    "wrong_register": "wrong_register",
    "regional_hallucination": "regional_hallucination",
}


def _score_map(payload: dict[str, Any], keys: tuple[str, ...]) -> dict[str, float]:
    raw = payload.get("scores")
    if not isinstance(raw, dict) or set(raw) != set(keys):
        raise ValueError(f"Judge scores must contain exactly {sorted(keys)}")
    result = {}
    for key in keys:
        value = raw[key]
        if (
            not isinstance(value, (int, float))
            or isinstance(value, bool)
            or not 0 <= float(value) <= 5
        ):
            raise ValueError(f"Judge score {key} must be between 0 and 5")
        result[key] = float(value)
    return result


def _closed_codes(
    payload: dict[str, Any], field: str, allowed: set[str]
) -> list[str]:
    raw = payload.get(field)
    if not isinstance(raw, list) or not all(isinstance(value, str) for value in raw):
        raise ValueError(f"Judge {field} must be an array of strings")
    invalid = sorted(set(raw) - allowed)
    if invalid:
        raise ValueError(f"Judge {field} contains unsupported values: {invalid}")
    return sorted(set(raw))


def _confidence(payload: dict[str, Any]) -> float:
    value = payload.get("confidence")
    if (
        not isinstance(value, (int, float))
        or isinstance(value, bool)
        or not 0 <= float(value) <= 1
    ):
        raise ValueError("Judge confidence must be between 0 and 1")
    return float(value)


def _hard_failures(payload: dict[str, Any], error_codes: list[str]) -> list[str]:
    explicit = _closed_codes(payload, "hardFailures", ALLOWED_HARD_FAILURES)
    implied = {
        IMPLIED_HARD_FAILURES[code]
        for code in error_codes
        if code in IMPLIED_HARD_FAILURES
    }
    return sorted(set(explicit) | implied)


def validate_quality(payload: dict[str, Any]) -> dict[str, Any]:
    allowed_keys = {"scores", "hardFailures", "errorCodes", "confidence"}
    if not isinstance(payload, dict) or set(payload) != allowed_keys:
        raise ValueError("Source-blind judge returned unsupported free-form fields")
    error_codes = _closed_codes(payload, "errorCodes", ALLOWED_ERROR_CODES)
    scores = _score_map(payload, QUALITY_SCORE_KEYS)
    hard_failures = set(_hard_failures(payload, error_codes))
    if scores["naturalness"] == 0 or scores["grammarAccuracy"] == 0:
        hard_failures.add("invalid_dutch")
    return {
        "scores": scores,
        "hardFailures": sorted(hard_failures),
        "errorCodes": error_codes,
        "confidence": _confidence(payload),
    }


def validate_fidelity(
    payload: dict[str, Any],
    reference_ids: list[str],
    sense_count: int,
) -> dict[str, Any]:
    allowed_keys = {
        "referenceMatches",
        "scores",
        "hardFailures",
        "errorCodes",
        "confidence",
    }
    if not isinstance(payload, dict) or set(payload) != allowed_keys:
        raise ValueError("Source-aware judge returned unsupported free-form fields")
    raw_matches = payload.get("referenceMatches")
    if not isinstance(raw_matches, list):
        raise ValueError("Judge referenceMatches must be an array")
    matches = []
    seen = set()
    for raw in raw_matches:
        if not isinstance(raw, dict) or set(raw) != {
            "referenceId",
            "matchedSenseIndexes",
            "fidelity",
        }:
            raise ValueError("Every reference match must use the closed schema")
        reference_id = raw.get("referenceId")
        if reference_id not in reference_ids or reference_id in seen:
            raise ValueError("Judge returned an unknown or duplicate referenceId")
        seen.add(reference_id)
        indexes = raw.get("matchedSenseIndexes")
        if not isinstance(indexes, list) or not all(
            isinstance(index, int)
            and not isinstance(index, bool)
            and 0 <= index < sense_count
            for index in indexes
        ):
            raise ValueError("Judge matchedSenseIndexes are invalid")
        fidelity = raw.get("fidelity")
        if (
            not isinstance(fidelity, (int, float))
            or isinstance(fidelity, bool)
            or not 0 <= float(fidelity) <= 5
        ):
            raise ValueError("Judge fidelity must be between 0 and 5")
        matches.append(
            {
                "referenceId": reference_id,
                "matchedSenseIndexes": sorted(set(indexes)),
                "fidelity": float(fidelity),
            }
        )
    if set(reference_ids) != seen:
        raise ValueError("Judge must return exactly one match for every reference")
    error_codes = _closed_codes(payload, "errorCodes", ALLOWED_ERROR_CODES)
    scores = _score_map(payload, FIDELITY_SCORE_KEYS)
    hard_failures = set(_hard_failures(payload, error_codes))
    if scores["senseCoverage"] == 0 or not any(
        match["matchedSenseIndexes"] for match in matches
    ):
        hard_failures.add("semantic_contradiction")
    return {
        "referenceMatches": matches,
        "scores": scores,
        "hardFailures": sorted(hard_failures),
        "errorCodes": error_codes,
        "confidence": _confidence(payload),
    }


def validate_claims_audit(
    payload: dict[str, Any], claims: list[dict[str, str]]
) -> dict[str, Any]:
    if not isinstance(payload, dict) or set(payload) != {"claims"}:
        raise ValueError("Optional-claims judge returned unsupported free-form fields")
    raw_results = payload["claims"]
    if not isinstance(raw_results, list):
        raise ValueError("Optional-claims judge claims must be an array")
    claim_by_id = {claim["claimId"]: claim for claim in claims}
    results = []
    seen = set()
    for raw in raw_results:
        if not isinstance(raw, dict) or set(raw) != {
            "claimId",
            "verdict",
            "confidence",
        }:
            raise ValueError("Every optional-claim result must use the closed schema")
        claim_id = raw["claimId"]
        if claim_id not in claim_by_id or claim_id in seen:
            raise ValueError("Optional-claims judge returned unknown or duplicate claimId")
        verdict = raw["verdict"]
        if verdict not in CLAIM_VERDICTS:
            raise ValueError("Optional-claims judge returned an unsupported verdict")
        confidence = raw["confidence"]
        if (
            not isinstance(confidence, (int, float))
            or isinstance(confidence, bool)
            or not 0 <= float(confidence) <= 1
        ):
            raise ValueError("Optional-claims judge confidence must be between 0 and 1")
        seen.add(claim_id)
        results.append(
            {
                "claimId": claim_id,
                "claimType": claim_by_id[claim_id]["claimType"],
                "verdict": verdict,
                "confidence": float(confidence),
            }
        )
    if seen != set(claim_by_id):
        raise ValueError("Optional-claims judge must return every supplied claimId")
    return {"claims": sorted(results, key=lambda value: value["claimId"])}


def claim_failures(audit: dict[str, Any]) -> tuple[list[str], list[str]]:
    errors: set[str] = set()
    hard_failures: set[str] = set()
    for claim in audit["claims"]:
        verdict = claim["verdict"]
        claim_type = claim["claimType"]
        if verdict == "uncertain":
            errors.add("uncertain_optional_claim")
        elif verdict == "false" and claim_type == "idiom":
            errors.add("invented_idiom")
            hard_failures.add("invented_idiom")
        elif verdict == "false" and claim_type == "synonym":
            errors.add("synonym_overclaim")
            hard_failures.add("unsupported_optional_claim")
        elif verdict == "false" and claim_type == "usage_guidance":
            errors.add("wrong_register")
            hard_failures.add("unsupported_optional_claim")
        elif verdict == "false":
            errors.add("valency_error")
            hard_failures.add("unsupported_optional_claim")
    return sorted(errors), sorted(hard_failures)


def composite_score(quality: dict[str, float], fidelity: dict[str, float]) -> float:
    weights = {
        "naturalness": 0.15,
        "learnerUsefulness": 0.15,
        "definitionClarity": 0.10,
        "exampleQuality": 0.10,
        "grammarAccuracy": 0.15,
        "senseCoverage": 0.15,
        "senseDiscrimination": 0.10,
        "independentWording": 0.10,
    }
    scores = {**quality, **fidelity}
    return round(sum(scores[key] * weight for key, weight in weights.items()), 4)


def article_quality_score(quality: dict[str, float]) -> float:
    weights = {
        "naturalness": 0.25,
        "learnerUsefulness": 0.20,
        "definitionClarity": 0.20,
        "exampleQuality": 0.15,
        "grammarAccuracy": 0.20,
    }
    return round(sum(quality[key] * weight for key, weight in weights.items()), 4)


def reference_alignment_score(fidelity: dict[str, float]) -> float:
    weights = {
        "senseCoverage": 0.45,
        "senseDiscrimination": 0.25,
        "independentWording": 0.30,
    }
    return round(sum(fidelity[key] * weight for key, weight in weights.items()), 4)


def zero_fidelity(reference_ids: list[str]) -> dict[str, Any]:
    return {
        "referenceMatches": [
            {
                "referenceId": reference_id,
                "matchedSenseIndexes": [],
                "fidelity": 0.0,
            }
            for reference_id in reference_ids
        ],
        "scores": {key: 0.0 for key in FIDELITY_SCORE_KEYS},
        "hardFailures": [],
        "errorCodes": [],
        "confidence": 1.0,
    }


def aggregate_fidelity(results: list[dict[str, Any]]) -> dict[str, Any]:
    if not results:
        raise ValueError("At least one source-aware fidelity result is required")
    return {
        "referenceMatches": [
            match for result in results for match in result["referenceMatches"]
        ],
        "scores": {
            key: round(
                sum(result["scores"][key] for result in results) / len(results),
                4,
            )
            for key in FIDELITY_SCORE_KEYS
        },
        "hardFailures": sorted(
            {code for result in results for code in result["hardFailures"]}
        ),
        "errorCodes": sorted(
            {code for result in results for code in result["errorCodes"]}
        ),
        "confidence": round(
            sum(result["confidence"] for result in results) / len(results),
            4,
        ),
    }
