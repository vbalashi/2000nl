from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import time
from typing import Any, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

from .generation import ChatResult


DEFAULT_MODEL = "gpt-4.1"
SUPPORTED_MODELS = frozenset(
    {"gpt-4.1", "gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"}
)
_PROFILE_PREFIXES = {
    "gpt-4.1": "AZURE_OPENAI_GPT41",
    "gpt-5.6-luna": "AZURE_OPENAI_GPT56_LUNA",
    "gpt-5.6-terra": "AZURE_OPENAI_GPT56_TERRA",
    "gpt-5.6-sol": "AZURE_OPENAI_GPT56_SOL",
}


@dataclass(frozen=True)
class ProviderConfig:
    api_key: str
    api_url: str
    model: str
    request_model: str
    include_model: bool
    endpoint_fingerprint: str


def _clean(value: Any) -> str:
    return str(value or "").strip().strip('"').strip("'")


def _endpoint_fingerprint(api_url: str) -> str:
    parsed = urlparse(api_url)
    provider = "azure" if "azure" in parsed.netloc.casefold() else "openai"
    digest = hashlib.sha256(
        f"{parsed.scheme}://{parsed.netloc}{parsed.path}".encode("utf-8")
    ).hexdigest()[:12]
    return f"{provider}:{digest}"


def _azure_url(endpoint: str, deployment: str, api_version: str) -> tuple[str, bool]:
    raw = endpoint.rstrip("/")
    if "/chat/completions" in raw.casefold():
        return raw, "/openai/deployments/" not in raw.casefold()
    if raw.casefold().endswith("/openai/v1"):
        return f"{raw}/chat/completions", True
    base = raw
    if base.casefold().endswith("/openai"):
        base = base[: -len("/openai")]
    if api_version and deployment:
        return (
            f"{base}/openai/deployments/{quote(deployment, safe='')}/chat/completions"
            f"?api-version={quote(api_version, safe='')}",
            False,
        )
    return f"{base}/openai/v1/chat/completions", True


def provider_config_from_env(
    environment: Mapping[str, str],
    *,
    model_override: str | None = None,
    require_source_aware_azure: bool = False,
) -> ProviderConfig:
    configured_model = _clean(environment.get("OPENAI_MODEL"))
    model = _clean(model_override) or configured_model or DEFAULT_MODEL
    if model not in SUPPORTED_MODELS:
        raise ValueError(
            f"Unsupported lexicography model {model!r}; expected one of "
            + ", ".join(sorted(SUPPORTED_MODELS))
        )
    profile_prefix = _PROFILE_PREFIXES[model] if model_override else ""
    azure_endpoint = (
        _clean(environment.get(f"{profile_prefix}_ENDPOINT"))
        if profile_prefix
        else ""
    ) or _clean(environment.get("AZURE_OPENAI_ENDPOINT"))
    azure_key = (
        _clean(environment.get(f"{profile_prefix}_API_KEY_PRIMARY"))
        if profile_prefix
        else ""
    ) or _clean(environment.get("AZURE_OPENAI_API_KEY"))
    profile_deployment = (
        _clean(environment.get(f"{profile_prefix}_DEPLOYMENT"))
        if profile_prefix
        else ""
    )
    configured_deployment = (
        _clean(environment.get("AZURE_OPENAI_DEPLOYMENT"))
        or _clean(environment.get("AZURE_OPENAI_MODEL"))
    )
    deployment = profile_deployment or (
        model if model_override else configured_deployment or configured_model
    )
    api_version = _clean(environment.get("AZURE_OPENAI_API_VERSION"))

    missing = []
    if not azure_endpoint:
        missing.append("endpoint")
    if not azure_key:
        missing.append("API key")
    if not deployment:
        missing.append("deployment")
    if missing:
        label = "Source-aware judging" if require_source_aware_azure else "Lexicography"
        raise ValueError(f"{label} requires private Azure " + ", ".join(missing))
    parsed = urlparse(azure_endpoint)
    if (
        parsed.scheme.casefold() != "https"
        or not parsed.hostname
        or not parsed.hostname.casefold().endswith(".openai.azure.com")
        or parsed.username
        or parsed.password
    ):
        label = "Source-aware judging" if require_source_aware_azure else "Lexicography"
        raise ValueError(
            f"{label} requires a validated HTTPS Azure OpenAI endpoint"
        )

    if require_source_aware_azure:
        azure_origin = f"https://{parsed.netloc}"
        normalized_path = parsed.path.rstrip("/").casefold()
        if normalized_path != "/openai/v1":
            raise ValueError(
                "Source-aware judging requires the validated Azure /openai/v1 endpoint"
            )
        if parsed.query or parsed.fragment:
            raise ValueError("Azure v1 endpoint must not contain query or fragment data")
        api_url = f"{azure_origin}/openai/v1/chat/completions"
        include_model = True
        api_key = azure_key
    else:
        api_url, include_model = _azure_url(azure_endpoint, deployment, api_version)
        api_key = azure_key
    return ProviderConfig(
        api_key=api_key,
        api_url=api_url,
        model=model,
        request_model=deployment or model,
        include_model=include_model,
        endpoint_fingerprint=_endpoint_fingerprint(api_url),
    )


def load_env_files(repo_root: Path, environment: Mapping[str, str] | None = None) -> dict[str, str]:
    result = dict(os.environ if environment is None else environment)
    candidates = [repo_root / ".env.local", repo_root / "apps" / "ui" / ".env.local"]
    for path in candidates:
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            key = key.strip()
            if key and not result.get(key):
                result[key] = _clean(value)
    return result


class OpenAIChatClient:
    def __init__(
        self,
        config: ProviderConfig,
        *,
        timeout_seconds: float = 60,
    ) -> None:
        self._config = config
        self.model = config.model
        self.endpoint_fingerprint = config.endpoint_fingerprint
        self.timeout_seconds = timeout_seconds

    def _headers(self) -> dict[str, str]:
        return {
            "content-type": "application/json",
            "api-key": self._config.api_key,
        }

    def chat_json(
        self,
        *,
        messages: list[dict[str, str]],
        temperature: float,
        max_output_tokens: int,
    ) -> ChatResult:
        body = self.request_body(
            messages=messages,
            temperature=temperature,
            max_output_tokens=max_output_tokens,
        )
        raw_request = json.dumps(body, ensure_ascii=False).encode("utf-8")
        started = time.monotonic()
        request = Request(
            self._config.api_url,
            data=raw_request,
            headers=self._headers(),
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                raw_response = response.read()
            latency_ms = int((time.monotonic() - started) * 1000)
            value = json.loads(raw_response)
            content = (
                (((value.get("choices") or [{}])[0]).get("message") or {}).get(
                    "content"
                )
                or ""
            )
            if not isinstance(content, str) or not content.strip():
                raise RuntimeError("Provider response is missing JSON content")
            payload = json.loads(content)
            if not isinstance(payload, dict):
                raise RuntimeError("Provider JSON content must be an object")
            usage = value.get("usage") if isinstance(value.get("usage"), dict) else {}
            return ChatResult(
                payload=payload,
                usage={
                    "prompt_tokens": int(usage.get("prompt_tokens") or 0),
                    "completion_tokens": int(usage.get("completion_tokens") or 0),
                },
                latency_ms=latency_ms,
                raw_response_hash=hashlib.sha256(raw_response).hexdigest(),
            )
        except HTTPError as error:
            raise RuntimeError(f"Provider HTTP error {error.code}") from error
        except (URLError, TimeoutError) as error:
            raise RuntimeError("Provider network request failed") from error

    def request_body(
        self,
        *,
        messages: list[dict[str, str]],
        temperature: float,
        max_output_tokens: int,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "messages": messages,
            "response_format": {"type": "json_object"},
        }
        if self.model.startswith("gpt-5"):
            body["reasoning_effort"] = "none"
            body["max_completion_tokens"] = max_output_tokens
        else:
            body["temperature"] = temperature
            body["max_tokens"] = max_output_tokens
        if self._config.include_model:
            body["model"] = self._config.request_model
        return body

    def effective_parameters(
        self, *, temperature: float, max_output_tokens: int
    ) -> dict[str, Any]:
        parameters: dict[str, Any] = {"maxOutputTokens": max_output_tokens}
        if self.model.startswith("gpt-5"):
            parameters["reasoningEffort"] = "none"
        else:
            parameters["temperature"] = temperature
        return parameters
