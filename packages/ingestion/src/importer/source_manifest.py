from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from typing import Any
import unicodedata

from jsonschema import Draft202012Validator


ARTIFACT_FINGERPRINT_VERSION = "vandale-semantic-v1"
NL_SCHEMA_PATH = (
    Path(__file__).resolve().parents[4]
    / "packages"
    / "shared"
    / "schemas"
    / "nl"
    / "note.schema.json"
)


def _canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def semantic_content_fingerprint(payload: dict[str, Any]) -> str:
    semantic = deepcopy(payload)
    for field in (
        "_raw_html",
        "_metadata",
        "_source",
        "source_identity",
        "part_of_speech_evidence",
        "audio_links",
        "images",
    ):
        semantic.pop(field, None)
    return hashlib.sha256(_canonical_json(semantic)).hexdigest()


def stored_raw_fingerprint(payload: dict[str, Any]) -> str:
    stored = deepcopy(payload)
    stored.pop("_raw_html", None)
    return hashlib.sha256(_canonical_json(stored)).hexdigest()


def platform_v2_content_node_inputs(
    payload: dict[str, Any],
) -> list[dict[str, str]]:
    """Build semantic node evidence without treating array position as identity."""
    nodes: list[dict[str, str]] = []

    def append_node(
        *,
        input_key: str,
        kind: str,
        source_path: str,
        text: Any,
        parent_input_key: str | None = None,
    ) -> None:
        if not isinstance(text, str) or not text.strip():
            return
        normalized_text = text.strip()
        canonical_source_text = unicodedata.normalize("NFC", normalized_text)
        node = {
            "inputKey": input_key,
            "kind": kind,
            "sourcePath": source_path,
            "sourceTextFingerprint": hashlib.sha256(
                _canonical_json(
                    {
                        "kind": kind,
                        "text": normalized_text,
                    }
                )
            ).hexdigest(),
            "sourceText": canonical_source_text,
        }
        if parent_input_key is not None:
            node["parentInputKey"] = parent_input_key
        nodes.append(node)

    meanings = payload.get("meanings")
    if not isinstance(meanings, list):
        return nodes

    for meaning_index, meaning in enumerate(meanings):
        if not isinstance(meaning, dict):
            continue
        prefix = f"meaning:{meaning_index}"
        source_prefix = f"raw.meanings[{meaning_index}]"
        append_node(
            input_key=f"{prefix}:definition",
            kind="definition",
            source_path=f"{source_prefix}.definition",
            text=meaning.get("definition"),
        )
        append_node(
            input_key=f"{prefix}:context",
            kind="usage-pattern",
            source_path=f"{source_prefix}.context",
            text=meaning.get("context"),
        )
        examples = meaning.get("examples")
        if isinstance(examples, list):
            for example_index, example in enumerate(examples):
                append_node(
                    input_key=f"{prefix}:example:{example_index}",
                    kind="example",
                    source_path=(
                        f"{source_prefix}.examples[{example_index}]"
                    ),
                    text=example,
                )

        idioms = meaning.get("idioms")
        if isinstance(idioms, list):
            for idiom_index, idiom in enumerate(idioms):
                idiom_key = f"{prefix}:idiom:{idiom_index}"
                idiom_path = f"{source_prefix}.idioms[{idiom_index}]"
                if isinstance(idiom, str):
                    append_node(
                        input_key=idiom_key,
                        kind="idiom",
                        source_path=idiom_path,
                        text=idiom,
                    )
                    continue
                if not isinstance(idiom, dict):
                    continue
                append_node(
                    input_key=idiom_key,
                    kind="idiom",
                    source_path=idiom_path,
                    text=idiom.get("expression"),
                )
                append_node(
                    input_key=f"{idiom_key}:explanation",
                    kind="idiom-explanation",
                    source_path=f"{idiom_path}.explanation",
                    text=idiom.get("explanation"),
                    parent_input_key=idiom_key,
                )
                idiom_examples = idiom.get("examples")
                if isinstance(idiom_examples, list):
                    for example_index, example in enumerate(idiom_examples):
                        append_node(
                            input_key=(
                                f"{idiom_key}:example:{example_index}"
                            ),
                            kind="example",
                            source_path=(
                                f"{idiom_path}.examples[{example_index}]"
                            ),
                            text=example,
                            parent_input_key=idiom_key,
                        )

        append_node(
            input_key=f"{prefix}:note",
            kind="usage-note",
            source_path=f"{source_prefix}.note",
            text=meaning.get("note"),
        )

    return nodes


@dataclass(frozen=True)
class SourceArtifact:
    path: Path
    artifact_path: str
    content_sha256: str
    identity_scheme_version: str
    source_entry_key: str
    source_group_key: str
    source_index: int
    sense_ordinal: int
    normalized_pos_status: str
    content_fingerprint: str
    fingerprint_version: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class SourceManifest:
    root: Path
    artifact_format_version: str
    identity_scheme_version: str
    input_sha256: str
    manifest_sha256: str
    source_record_count: int
    artifacts: tuple[SourceArtifact, ...]


def _safe_artifact_path(root: Path, artifact_path: str) -> Path:
    relative = Path(artifact_path)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"unsafe artifact path: {artifact_path}")
    resolved_root = root.resolve()
    resolved = (root / relative).resolve()
    if resolved.parent != resolved_root:
        raise ValueError(f"unsafe artifact path: {artifact_path}")
    return resolved


def _load_payload(path: Path) -> dict[str, Any]:
    content = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(content, list) or len(content) != 1:
        raise ValueError(f"{path} must contain exactly one entry")
    payload = content[0]
    if not isinstance(payload, dict):
        raise ValueError(f"{path} entry must be an object")
    return payload


def _load_schema_validator() -> Draft202012Validator:
    schema = json.loads(NL_SCHEMA_PATH.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def _validate_payload(
    validator: Draft202012Validator,
    payload: dict[str, Any],
    artifact_path: str,
) -> None:
    errors = sorted(
        validator.iter_errors(payload),
        key=lambda error: tuple(str(part) for part in error.absolute_path),
    )
    if not errors:
        return
    error = errors[0]
    location = ".".join(str(part) for part in error.absolute_path) or "<root>"
    raise ValueError(
        f"{artifact_path} violates NL dictionary schema at "
        f"{location}: {error.message}"
    )


def load_source_manifest(data_dir: Path | str) -> SourceManifest:
    root = Path(data_dir)
    manifest_path = root / "_manifest.jsonl"
    summary_path = root / "_manifest.summary.json"
    if not manifest_path.is_file() or not summary_path.is_file():
        raise ValueError(f"{root} is missing the required source manifest")

    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    actual_manifest_sha256 = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    if summary.get("manifest_sha256") != actual_manifest_sha256:
        raise ValueError("manifest checksum mismatch")

    records = [
        json.loads(line)
        for line in manifest_path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    if summary.get("artifact_count") != len(records):
        raise ValueError("manifest artifact count mismatch")

    artifacts = []
    schema_validator = _load_schema_validator()
    seen_paths = set()
    seen_source_keys = set()
    expected_scheme = summary.get("identity_scheme_version")
    for record in records:
        artifact_path = record.get("artifact_path")
        if not isinstance(artifact_path, str):
            raise ValueError("manifest artifact path must be a string")
        if artifact_path in seen_paths:
            raise ValueError(f"duplicate artifact path: {artifact_path}")
        seen_paths.add(artifact_path)

        path = _safe_artifact_path(root, artifact_path)
        if not path.is_file():
            raise ValueError(f"missing artifact: {artifact_path}")
        actual_checksum = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual_checksum != record.get("content_sha256"):
            raise ValueError(f"artifact checksum mismatch: {artifact_path}")

        payload = _load_payload(path)
        _validate_payload(schema_validator, payload, artifact_path)
        source = payload.get("_source")
        if not isinstance(source, dict):
            raise ValueError(f"{artifact_path} is missing _source")
        for field in (
            "identity_scheme_version",
            "source_entry_key",
            "source_group_key",
        ):
            if source.get(field) != record.get(field):
                raise ValueError(f"{artifact_path} {field} does not match manifest")
        if source.get("identity_scheme_version") != expected_scheme:
            raise ValueError(f"{artifact_path} identity scheme mismatch")

        source_entry_key = source["source_entry_key"]
        if source_entry_key in seen_source_keys:
            raise ValueError(f"duplicate source entry key: {source_entry_key}")
        seen_source_keys.add(source_entry_key)

        source_index = source.get("source_index")
        sense_ordinal = source.get("sense_ordinal")
        if not isinstance(source_index, int) or not isinstance(sense_ordinal, int):
            raise ValueError(f"{artifact_path} has invalid source ordinals")

        artifacts.append(
            SourceArtifact(
                path=path,
                artifact_path=artifact_path,
                content_sha256=actual_checksum,
                identity_scheme_version=source["identity_scheme_version"],
                source_entry_key=source_entry_key,
                source_group_key=source["source_group_key"],
                source_index=source_index,
                sense_ordinal=sense_ordinal,
                normalized_pos_status=source.get(
                    "normalized_pos_status",
                    "unresolved",
                ),
                content_fingerprint=semantic_content_fingerprint(payload),
                fingerprint_version=ARTIFACT_FINGERPRINT_VERSION,
                payload=payload,
            )
        )

    return SourceManifest(
        root=root.resolve(),
        artifact_format_version=summary["artifact_format_version"],
        identity_scheme_version=expected_scheme,
        input_sha256=summary["input_sha256"],
        manifest_sha256=actual_manifest_sha256,
        source_record_count=int(summary["source_record_count"]),
        artifacts=tuple(artifacts),
    )
