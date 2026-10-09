from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Iterable

from .artifacts import sha256 as _sha256


PUBLIC_SCHEMA = "lexicography-sample-v1"
PROTECTED_SCHEMA = "lexicography-protected-references-v1"
HOLDOUT_LEDGER_SCHEMA = "lexicography-holdout-release-ledger-v1"
ALLOWED_SPLITS = {"development", "validation", "holdout"}
GRAMMAR_FIELDS = (
    "gender",
    "plural",
    "diminutive",
    "verb_forms",
    "inflected_form",
    "comparative",
    "superlative",
)


@dataclass(frozen=True)
class PreparedBenchmark:
    case_count: int
    meaning_count: int
    sample_sha256: str
    protected_sha256: str
    holdout_sha256: str | None = None
    holdout_protected_sha256: str | None = None
    holdout_ledger_sha256: str | None = None


@dataclass(frozen=True)
class CombinedBenchmark:
    case_count: int
    meaning_count: int
    sample_sha256: str
    protected_sha256: str


def _read_payload(path: Path) -> dict[str, Any] | None:
    if path.name.startswith("_"):
        return None
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list) or not value or not isinstance(value[0], dict):
        return None
    return value[0]


def _load_corpus(corpus_root: Path) -> list[tuple[Path, dict[str, Any]]]:
    if not corpus_root.is_dir():
        raise ValueError(f"Corpus directory does not exist: {corpus_root}")
    records = []
    for path in sorted(corpus_root.glob("*.json"), key=lambda item: item.name):
        payload = _read_payload(path)
        if payload is not None:
            records.append((path, payload))
    if not records:
        raise ValueError(f"Corpus contains no structured sense artifacts: {corpus_root}")
    return records


def _as_nonempty(value: Any) -> Any | None:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    if isinstance(value, list):
        return value or None
    if isinstance(value, dict):
        return value or None
    return value if value is not None else None


def _grammar_from(payload: dict[str, Any]) -> dict[str, Any]:
    grammar: dict[str, Any] = {}
    for field in GRAMMAR_FIELDS:
        value = _as_nonempty(payload.get(field))
        if value is not None:
            grammar[field] = value
    return grammar


def _meaning(payload: dict[str, Any]) -> dict[str, Any]:
    meanings = payload.get("meanings")
    if not isinstance(meanings, list) or not meanings:
        return {}
    value = meanings[0]
    return value if isinstance(value, dict) else {}


def _text_list(value: Any) -> list[Any]:
    return list(value) if isinstance(value, list) else []


def _protected_reference(payload: dict[str, Any]) -> dict[str, Any]:
    meaning = _meaning(payload)
    source = payload.get("_source")
    if not isinstance(source, dict):
        source = {}
    return {
        "meaningId": payload.get("meaning_id"),
        "definition": str(meaning.get("definition") or "").strip(),
        "context": str(meaning.get("context") or "").strip(),
        "examples": _text_list(meaning.get("examples")),
        "idioms": _text_list(meaning.get("idioms")),
        "synonyms": _text_list(meaning.get("synonyms")),
        "usageLabels": _text_list(meaning.get("usage_labels")),
        "sourceEntryKey": source.get("source_entry_key"),
        "sourceGroupKey": source.get("source_group_key"),
        "sourceHash": _sha256(
            {
                "headword": payload.get("headword"),
                "partOfSpeech": payload.get("part_of_speech"),
                "meaningId": payload.get("meaning_id"),
                "meaning": meaning,
            }
        ),
    }


def _case_id(headword: str, part_of_speech: str) -> str:
    digest = _sha256(
        {
            "headword": headword.casefold(),
            "partOfSpeech": part_of_speech.casefold(),
        }
    )[:16]
    return f"lex_{digest}"


def _selection_lemmas(selection: dict[str, Any]) -> list[dict[str, Any]]:
    if selection.get("schema") != "lexicography-selection-v1":
        raise ValueError("Selection must use lexicography-selection-v1")
    lemmas = selection.get("lemmas")
    if not isinstance(lemmas, list) or not lemmas:
        raise ValueError("Selection must contain a non-empty lemmas array")
    return lemmas


def _matching_records(
    records: Iterable[tuple[Path, dict[str, Any]]],
    *,
    headword: str,
    part_of_speech: str,
    meaning_ids: list[int],
) -> list[tuple[Path, dict[str, Any]]]:
    wanted = set(meaning_ids)
    matches = [
        item
        for item in records
        if str(item[1].get("headword") or "").casefold() == headword.casefold()
        and str(item[1].get("part_of_speech") or "").casefold()
        == part_of_speech.casefold()
        and item[1].get("meaning_id") in wanted
    ]
    counts: dict[int, int] = {meaning_id: 0 for meaning_id in meaning_ids}
    for _, payload in matches:
        counts[payload["meaning_id"]] += 1
    invalid = {key: count for key, count in counts.items() if count != 1}
    if invalid:
        raise ValueError(
            f"Selection {headword}/{part_of_speech} must resolve each meaning once; "
            f"got {invalid}"
        )
    return sorted(matches, key=lambda item: int(item[1]["meaning_id"]))


def _strata(references: list[dict[str, Any]], payload: dict[str, Any]) -> list[str]:
    tags = []
    tags.append("core" if bool(payload.get("is_nt2_2000")) else "extended")
    if len(references) > 1:
        tags.append("polysemy-contrast")
    if any(item["idioms"] for item in references):
        tags.append("idiom-bearing")
    if any(not item["definition"] and item["idioms"] for item in references):
        tags.append("idiom-only")
    if any(item["examples"] for item in references):
        tags.append("source-example-present")
    else:
        tags.append("source-example-absent")
    if len(_grammar_from(payload)) >= 2:
        tags.append("morphology")
    return sorted(tags)


def _write_json(
    path: Path,
    value: Any,
    *,
    protected: bool = False,
    immutable: bool = False,
) -> str:
    if immutable and path.exists():
        raise FileExistsError(f"Immutable holdout artifact already exists: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    rendered = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        indent=2,
    ) + "\n"
    if immutable:
        with path.open("x", encoding="utf-8") as stream:
            stream.write(rendered)
    else:
        path.write_text(rendered, encoding="utf-8")
    if immutable:
        os.chmod(path, 0o400)
    elif protected:
        os.chmod(path, 0o600)
    return hashlib.sha256(rendered.encode("utf-8")).hexdigest()


def prepare_benchmark(
    *,
    corpus_root: Path,
    selection: dict[str, Any],
    public_path: Path,
    protected_path: Path,
    holdout_path: Path | None = None,
    holdout_protected_path: Path | None = None,
    holdout_ledger_path: Path | None = None,
) -> PreparedBenchmark:
    records = _load_corpus(corpus_root)
    benchmark_id = str(selection.get("benchmarkId") or "").strip()
    if not benchmark_id:
        raise ValueError("Selection benchmarkId is required")

    public_cases = []
    protected_cases = []
    seen_clusters: set[tuple[str, str]] = set()
    meaning_count = 0

    for selected in _selection_lemmas(selection):
        if not isinstance(selected, dict):
            raise ValueError("Every selected lemma must be an object")
        headword = str(selected.get("headword") or "").strip()
        part_of_speech = str(selected.get("partOfSpeech") or "").strip()
        split = str(selected.get("split") or "").strip()
        raw_meaning_ids = selected.get("selectedMeaningIds")
        if not headword or not part_of_speech:
            raise ValueError("Selected headword and partOfSpeech are required")
        if split not in ALLOWED_SPLITS:
            raise ValueError(f"Unsupported split for {headword}: {split}")
        if (
            not isinstance(raw_meaning_ids, list)
            or not raw_meaning_ids
            or not all(
                isinstance(value, int) and not isinstance(value, bool) and value >= 1
                for value in raw_meaning_ids
            )
            or len(set(raw_meaning_ids)) != len(raw_meaning_ids)
        ):
            raise ValueError(f"Selected meaning IDs are invalid for {headword}")
        meaning_ids = list(raw_meaning_ids)
        cluster = (headword.casefold(), part_of_speech.casefold())
        if cluster in seen_clusters:
            raise ValueError(f"Duplicate headword cluster in selection: {headword}")
        seen_clusters.add(cluster)

        matches = _matching_records(
            records,
            headword=headword,
            part_of_speech=part_of_speech,
            meaning_ids=meaning_ids,
        )
        source_group_keys = {
            str((payload.get("_source") or {}).get("source_group_key") or "").strip()
            if isinstance(payload.get("_source"), dict)
            else ""
            for _, payload in matches
        }
        if len(source_group_keys) != 1 or "" in source_group_keys:
            raise ValueError(
                f"Selection {headword}/{part_of_speech} crosses provider article groups"
            )
        first_payload = matches[0][1]
        references = [_protected_reference(payload) for _, payload in matches]
        case_id = _case_id(headword, part_of_speech)
        grammar = _grammar_from(first_payload)
        generation_input: dict[str, Any] = {
            "headword": headword,
            "languageCode": "nl",
            "partOfSpeech": part_of_speech,
        }
        if grammar:
            generation_input["grammar"] = grammar
        public_cases.append(
            {
                "caseId": case_id,
                "split": split,
                "generationInput": generation_input,
                "strata": _strata(references, first_payload),
                "referenceIds": [
                    f"ref_{reference['sourceHash'][:16]}" for reference in references
                ],
            }
        )
        protected_cases.append(
            {
                "caseId": case_id,
                "headword": headword,
                "partOfSpeech": part_of_speech,
                "split": split,
                "references": references,
            }
        )
        meaning_count += len(references)

    holdout_bundle_paths = (
        holdout_path,
        holdout_protected_path,
        holdout_ledger_path,
    )
    if any(path is not None for path in holdout_bundle_paths) and not all(
        path is not None for path in holdout_bundle_paths
    ):
        raise ValueError("All holdout release paths must be supplied together")

    holdout_cases = [case for case in public_cases if case["split"] == "holdout"]
    if holdout_cases and holdout_path is None:
        raise ValueError("Holdout cases require a separate holdout release bundle")
    if holdout_path is not None:
        visible_dir = public_path.resolve().parent
        release_dirs = {
            holdout_path.resolve().parent,
            holdout_protected_path.resolve().parent,  # type: ignore[union-attr]
            holdout_ledger_path.resolve().parent,  # type: ignore[union-attr]
        }
        if len(release_dirs) != 1 or visible_dir in release_dirs:
            raise ValueError(
                "Holdout artifacts must share a release directory separate from visible output"
            )

    visible_cases = [case for case in public_cases if case["split"] != "holdout"]
    visible_protected_cases = [
        case for case in protected_cases if case["split"] != "holdout"
    ]
    holdout_protected_cases = [
        case for case in protected_cases if case["split"] == "holdout"
    ]
    visible_meaning_count = sum(len(case["referenceIds"]) for case in visible_cases)
    public_value = {
        "schema": PUBLIC_SCHEMA,
        "benchmarkId": benchmark_id,
        "selectionHash": _sha256(selection),
        "caseCount": len(visible_cases),
        "meaningCount": visible_meaning_count,
        "cases": visible_cases,
    }
    protected_value = {
        "schema": PROTECTED_SCHEMA,
        "benchmarkId": benchmark_id,
        "selectionHash": _sha256(selection),
        "caseCount": len(visible_protected_cases),
        "meaningCount": sum(
            len(case["references"]) for case in visible_protected_cases
        ),
        "cases": visible_protected_cases,
    }
    sample_sha = _write_json(public_path, public_value)
    protected_sha = _write_json(protected_path, protected_value, protected=True)
    holdout_sha = None
    holdout_protected_sha = None
    holdout_ledger_sha = None
    if holdout_path is not None:
        if not holdout_cases:
            raise ValueError("Selection has no holdout cases to seal")
        holdout_value = {
            "schema": PUBLIC_SCHEMA,
            "benchmarkId": benchmark_id,
            "selectionHash": _sha256(selection),
            "sealed": True,
            "caseCount": len(holdout_cases),
            "meaningCount": sum(len(case["referenceIds"]) for case in holdout_cases),
            "cases": holdout_cases,
        }
        holdout_protected_value = {
            "schema": PROTECTED_SCHEMA,
            "benchmarkId": benchmark_id,
            "selectionHash": _sha256(selection),
            "sealed": True,
            "caseCount": len(holdout_protected_cases),
            "meaningCount": sum(
                len(case["references"]) for case in holdout_protected_cases
            ),
            "cases": holdout_protected_cases,
        }
        holdout_sha = _write_json(
            holdout_path, holdout_value, protected=True, immutable=True
        )
        holdout_protected_sha = _write_json(
            holdout_protected_path,  # type: ignore[arg-type]
            holdout_protected_value,
            protected=True,
            immutable=True,
        )
        ledger_value = {
            "schema": HOLDOUT_LEDGER_SCHEMA,
            "benchmarkId": benchmark_id,
            "selectionHash": _sha256(selection),
            "sampleSha256": holdout_sha,
            "protectedSha256": holdout_protected_sha,
            "bindingFile": "run-binding.json",
        }
        holdout_ledger_sha = _write_json(
            holdout_ledger_path,  # type: ignore[arg-type]
            ledger_value,
            protected=True,
            immutable=True,
        )
    return PreparedBenchmark(
        case_count=len(public_cases),
        meaning_count=meaning_count,
        sample_sha256=sample_sha,
        protected_sha256=protected_sha,
        holdout_sha256=holdout_sha,
        holdout_protected_sha256=holdout_protected_sha,
        holdout_ledger_sha256=holdout_ledger_sha,
    )


def combine_review_bundles(
    *,
    open_sample: dict[str, Any],
    holdout_sample: dict[str, Any],
    open_protected: dict[str, Any],
    holdout_protected: dict[str, Any],
    public_path: Path,
    protected_path: Path,
) -> CombinedBenchmark:
    bundles = (open_sample, holdout_sample, open_protected, holdout_protected)
    benchmark_ids = {bundle.get("benchmarkId") for bundle in bundles}
    selection_hashes = {bundle.get("selectionHash") for bundle in bundles}
    if len(benchmark_ids) != 1 or None in benchmark_ids:
        raise ValueError("Review bundles must share one benchmarkId")
    if len(selection_hashes) != 1 or None in selection_hashes:
        raise ValueError("Review bundles must share one selectionHash")
    if open_sample.get("schema") != PUBLIC_SCHEMA or holdout_sample.get(
        "schema"
    ) != PUBLIC_SCHEMA:
        raise ValueError("Review samples use an unsupported schema")
    if open_protected.get("schema") != PROTECTED_SCHEMA or holdout_protected.get(
        "schema"
    ) != PROTECTED_SCHEMA:
        raise ValueError("Review protected bundles use an unsupported schema")
    sample_cases = list(open_sample.get("cases") or []) + list(
        holdout_sample.get("cases") or []
    )
    protected_cases = list(open_protected.get("cases") or []) + list(
        holdout_protected.get("cases") or []
    )
    sample_ids = [case.get("caseId") for case in sample_cases]
    protected_ids = [case.get("caseId") for case in protected_cases]
    if (
        len(sample_ids) != len(set(sample_ids))
        or len(protected_ids) != len(set(protected_ids))
        or set(sample_ids) != set(protected_ids)
    ):
        raise ValueError("Review bundles must contain matching disjoint case IDs")
    meaning_count = sum(len(case.get("referenceIds") or []) for case in sample_cases)
    public_value = {
        "schema": PUBLIC_SCHEMA,
        "benchmarkId": next(iter(benchmark_ids)),
        "selectionHash": next(iter(selection_hashes)),
        "finalReviewBundle": True,
        "caseCount": len(sample_cases),
        "meaningCount": meaning_count,
        "cases": sample_cases,
    }
    protected_value = {
        "schema": PROTECTED_SCHEMA,
        "benchmarkId": next(iter(benchmark_ids)),
        "selectionHash": next(iter(selection_hashes)),
        "finalReviewBundle": True,
        "caseCount": len(protected_cases),
        "meaningCount": sum(
            len(case.get("references") or []) for case in protected_cases
        ),
        "cases": protected_cases,
    }
    return CombinedBenchmark(
        case_count=len(sample_cases),
        meaning_count=meaning_count,
        sample_sha256=_write_json(public_path, public_value),
        protected_sha256=_write_json(
            protected_path, protected_value, protected=True
        ),
    )
