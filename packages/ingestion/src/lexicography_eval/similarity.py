from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re
from typing import Any, Iterable


TOKEN_RE = re.compile(r"[^\W_]+(?:['’][^\W_]+)?", re.UNICODE)


def normalize_tokens(text: str) -> tuple[str, ...]:
    return tuple(match.group(0).casefold() for match in TOKEN_RE.finditer(text))


def _ngrams(tokens: tuple[str, ...], size: int) -> set[tuple[str, ...]]:
    if len(tokens) < size:
        return set()
    return {tokens[index : index + size] for index in range(len(tokens) - size + 1)}


def _longest_common_span(left: tuple[str, ...], right: tuple[str, ...]) -> int:
    if not left or not right:
        return 0
    previous = [0] * (len(right) + 1)
    longest = 0
    for left_token in left:
        current = [0]
        for index, right_token in enumerate(right, start=1):
            length = previous[index - 1] + 1 if left_token == right_token else 0
            current.append(length)
            longest = max(longest, length)
        previous = current
    return longest


@dataclass(frozen=True)
class SourceText:
    source_hash: str
    field: str
    text: str


@dataclass(frozen=True)
class CandidateText:
    field: str
    text: str


@dataclass(frozen=True)
class SimilarityFlag:
    code: str
    candidate_field: str
    source_field: str
    source_hash: str
    hard: bool
    detail: dict[str, int | str]


@dataclass(frozen=True)
class SimilarityResult:
    hard_failure: bool
    flags: tuple[SimilarityFlag, ...]


class SourceTextIndex:
    def __init__(self, sources: Iterable[SourceText]) -> None:
        self.sources = tuple(source for source in sources if source.text.strip())
        self.index_hash = hashlib.sha256(
            json.dumps(
                [
                    {
                        "sourceHash": source.source_hash,
                        "field": source.field,
                        "textHash": hashlib.sha256(source.text.encode("utf-8")).hexdigest(),
                    }
                    for source in self.sources
                ],
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest()
        self._tokens = tuple(normalize_tokens(source.text) for source in self.sources)
        self._exact: dict[tuple[str, ...], set[int]] = {}
        self._five_grams: dict[tuple[str, ...], set[int]] = {}
        for index, tokens in enumerate(self._tokens):
            self._exact.setdefault(tokens, set()).add(index)
            for ngram in _ngrams(tokens, 5):
                self._five_grams.setdefault(ngram, set()).add(index)

    def possible_matches(self, tokens: tuple[str, ...]) -> set[int]:
        matches = set(self._exact.get(tokens, set()))
        for ngram in _ngrams(tokens, 5):
            matches.update(self._five_grams.get(ngram, set()))
        return matches

    def tokens(self, index: int) -> tuple[str, ...]:
        return self._tokens[index]


def source_texts_from_corpus(corpus_root: Path) -> list[SourceText]:
    if not corpus_root.is_dir():
        raise ValueError(f"Corpus directory does not exist: {corpus_root}")
    result: list[SourceText] = []

    def add(path: Path, field: str, value: Any) -> None:
        if not isinstance(value, str) or not value.strip():
            return
        text = value.strip()
        digest = hashlib.sha256(
            f"{path.name}\0{field}\0{text}".encode("utf-8")
        ).hexdigest()
        result.append(SourceText(source_hash=digest, field=field, text=text))

    for path in sorted(corpus_root.glob("*.json"), key=lambda item: item.name):
        if path.name.startswith("_"):
            continue
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, list) or not value or not isinstance(value[0], dict):
            continue
        meanings = value[0].get("meanings")
        if not isinstance(meanings, list):
            continue
        for meaning_index, meaning in enumerate(meanings):
            if not isinstance(meaning, dict):
                continue
            prefix = f"meaning.{meaning_index}"
            add(path, "definition", meaning.get("definition"))
            add(path, "context", meaning.get("context"))
            add(path, "note", meaning.get("note"))
            for index, example in enumerate(meaning.get("examples") or []):
                add(path, "example", example)
            for index, synonym in enumerate(meaning.get("synonyms") or []):
                add(path, "synonym", synonym)
            for index, idiom in enumerate(meaning.get("idioms") or []):
                if isinstance(idiom, str):
                    add(path, "idiom_expression", idiom)
                elif isinstance(idiom, dict):
                    add(path, "idiom_expression", idiom.get("expression"))
                    add(path, "idiom_explanation", idiom.get("explanation"))
                    for example in idiom.get("examples") or []:
                        add(path, "example", example)
    return result


def _candidate_texts(candidate: dict[str, Any]) -> list[CandidateText]:
    content = candidate.get("content")
    if not isinstance(content, dict):
        return []
    senses = content.get("senses")
    if not isinstance(senses, list):
        return []
    result: list[CandidateText] = []

    def add(field: str, value: Any) -> None:
        if isinstance(value, str) and value.strip():
            result.append(CandidateText(field=field, text=value.strip()))

    for sense_index, sense in enumerate(senses):
        if not isinstance(sense, dict):
            continue
        prefix = f"senses.{sense_index}"
        add(f"{prefix}.definition", sense.get("definition"))
        add(f"{prefix}.usageNote", sense.get("usageNote"))
        add(f"{prefix}.usagePattern", sense.get("usagePattern"))
        for index, value in enumerate(sense.get("examples") or []):
            add(f"{prefix}.examples.{index}", value)
        for index, value in enumerate(sense.get("collocations") or []):
            add(f"{prefix}.collocations.{index}", value)
        for index, synonym in enumerate(sense.get("synonyms") or []):
            if isinstance(synonym, dict):
                add(f"{prefix}.synonyms.{index}.term", synonym.get("term"))
                add(
                    f"{prefix}.synonyms.{index}.limitation",
                    synonym.get("limitation"),
                )
        for index, idiom in enumerate(sense.get("idioms") or []):
            if not isinstance(idiom, dict):
                continue
            add(f"{prefix}.idioms.{index}.expression", idiom.get("expression"))
            add(f"{prefix}.idioms.{index}.explanation", idiom.get("explanation"))
            for example_index, value in enumerate(idiom.get("examples") or []):
                add(f"{prefix}.idioms.{index}.examples.{example_index}", value)
    return result


def _is_example(field: str) -> bool:
    return ".examples." in field or field == "example"


def _is_idiom_expression(field: str) -> bool:
    return field.endswith(".expression") or field == "idiom_expression"


def scan_candidate_against_sources(
    candidate: dict[str, Any],
    sources: Iterable[SourceText] | SourceTextIndex,
) -> SimilarityResult:
    index = sources if isinstance(sources, SourceTextIndex) else SourceTextIndex(sources)
    flags: list[SimilarityFlag] = []
    seen: set[tuple[str, str, str]] = set()

    def add(
        *,
        code: str,
        candidate_field: str,
        source: SourceText,
        hard: bool,
        detail: dict[str, int | str],
    ) -> None:
        key = (code, candidate_field, source.source_hash)
        if key in seen:
            return
        seen.add(key)
        flags.append(
            SimilarityFlag(
                code=code,
                candidate_field=candidate_field,
                source_field=source.field,
                source_hash=source.source_hash,
                hard=hard,
                detail=detail,
            )
        )

    for candidate_text in _candidate_texts(candidate):
        tokens = normalize_tokens(candidate_text.text)
        if not tokens:
            continue
        for source_index in sorted(index.possible_matches(tokens)):
            source = index.sources[source_index]
            source_tokens = index.tokens(source_index)
            exact = tokens == source_tokens
            idiom_expression = _is_idiom_expression(candidate_text.field)
            if exact and _is_example(candidate_text.field) and _is_example(source.field):
                add(
                    code="exact_source_example",
                    candidate_field=candidate_text.field,
                    source=source,
                    hard=True,
                    detail={"tokenCount": len(tokens)},
                )
            elif exact and idiom_expression:
                add(
                    code="fixed_expression_match_review",
                    candidate_field=candidate_text.field,
                    source=source,
                    hard=False,
                    detail={"tokenCount": len(tokens)},
                )
            elif exact and len(tokens) >= 6:
                add(
                    code="exact_source_text",
                    candidate_field=candidate_text.field,
                    source=source,
                    hard=True,
                    detail={"tokenCount": len(tokens)},
                )
            elif exact:
                add(
                    code="exact_short_source_text_review",
                    candidate_field=candidate_text.field,
                    source=source,
                    hard=False,
                    detail={"tokenCount": len(tokens)},
                )

            longest = _longest_common_span(tokens, source_tokens)
            if longest >= 8 and not idiom_expression:
                add(
                    code="continuous_source_span",
                    candidate_field=candidate_text.field,
                    source=source,
                    hard=True,
                    detail={"tokenCount": longest},
                )
            shared_five_grams = len(_ngrams(tokens, 5) & _ngrams(source_tokens, 5))
            if shared_five_grams >= 2 and not idiom_expression:
                # Two overlapping five-grams are often only a six-token span of
                # ordinary learner language. The eight-token rule above remains
                # the deterministic hard gate; fragmented overlap stays visible
                # for manual/source-aware review instead of creating noisy fails.
                add(
                    code="repeated_source_five_gram",
                    candidate_field=candidate_text.field,
                    source=source,
                    hard=False,
                    detail={"matchCount": shared_five_grams},
                )

    ordered = tuple(
        sorted(
            flags,
            key=lambda item: (
                not item.hard,
                item.code,
                item.candidate_field,
                item.source_hash,
            ),
        )
    )
    return SimilarityResult(
        hard_failure=any(flag.hard for flag in ordered),
        flags=ordered,
    )
