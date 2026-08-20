from __future__ import annotations

from pathlib import Path
import sys


INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))

import pytest

from lexicography_eval.provider import (  # noqa: E402
    OpenAIChatClient,
    provider_config_from_env,
)


def test_provider_config_reuses_azure_v1_endpoint_and_gpt_4_1() -> None:
    config = provider_config_from_env(
        {
            "OPENAI_MODEL": "gpt-4.1",
            "OPENAI_API_KEY": "fallback-key",
            "AZURE_OPENAI_ENDPOINT": "https://example.openai.azure.com/openai/v1/",
            "AZURE_OPENAI_API_KEY": "azure-key",
        }
    )

    assert config.model == "gpt-4.1"
    assert config.api_key == "azure-key"
    assert config.api_url == "https://example.openai.azure.com/openai/v1/chat/completions"
    assert config.include_model is True
    assert "example.openai.azure.com" not in config.endpoint_fingerprint


def test_provider_config_supports_azure_deployment_style_url() -> None:
    config = provider_config_from_env(
        {
            "AZURE_OPENAI_ENDPOINT": "https://example.openai.azure.com",
            "AZURE_OPENAI_API_KEY": "azure-key",
            "AZURE_OPENAI_DEPLOYMENT": "gpt-4.1",
            "AZURE_OPENAI_API_VERSION": "2025-04-01-preview",
        }
    )

    assert config.api_url.endswith(
        "/openai/deployments/gpt-4.1/chat/completions?api-version=2025-04-01-preview"
    )
    assert config.include_model is False


def test_source_aware_provider_requires_complete_private_azure_configuration() -> None:
    with pytest.raises(ValueError, match="Source-aware judging requires"):
        provider_config_from_env(
            {
                "OPENAI_MODEL": "gpt-4.1",
                "OPENAI_API_KEY": "public-key",
            },
            require_source_aware_azure=True,
        )


def test_all_lexicography_provider_calls_require_private_azure() -> None:
    with pytest.raises(ValueError, match="private Azure"):
        provider_config_from_env(
            {
                "OPENAI_MODEL": "gpt-4.1",
                "OPENAI_API_URL": "https://api.openai.com/v1/chat/completions",
                "OPENAI_API_KEY": "public-key",
            }
        )

    with pytest.raises(ValueError, match="Azure /openai/v1"):
        provider_config_from_env(
            {
                "AZURE_OPENAI_ENDPOINT": "https://example.openai.azure.com",
                "AZURE_OPENAI_API_KEY": "azure-key",
                "AZURE_OPENAI_DEPLOYMENT": "gpt-4.1",
            },
            require_source_aware_azure=True,
        )

    with pytest.raises(ValueError, match="deployment"):
        provider_config_from_env(
            {
                "AZURE_OPENAI_ENDPOINT": "https://example.openai.azure.com",
                "AZURE_OPENAI_API_KEY": "azure-key",
                "AZURE_OPENAI_API_VERSION": "2025-04-01-preview",
            },
            require_source_aware_azure=True,
        )

    with pytest.raises(ValueError, match="validated HTTPS Azure OpenAI endpoint"):
        provider_config_from_env(
            {
                "AZURE_OPENAI_ENDPOINT": "https://api.openai.com/v1",
                "AZURE_OPENAI_API_KEY": "azure-key",
                "AZURE_OPENAI_DEPLOYMENT": "gpt-4.1",
                "AZURE_OPENAI_API_VERSION": "2025-04-01-preview",
            },
            require_source_aware_azure=True,
        )

    with pytest.raises(ValueError, match="Azure /openai/v1"):
        provider_config_from_env(
            {
                "AZURE_OPENAI_ENDPOINT": "https://example.openai.azure.com",
                "AZURE_OPENAI_API_KEY": "azure-key",
                "AZURE_OPENAI_DEPLOYMENT": "gpt-4.1",
                "AZURE_OPENAI_API_VERSION": "2025-04-01-preview",
            },
            require_source_aware_azure=True,
        )


def test_source_aware_provider_accepts_validated_azure_v1_endpoint() -> None:
    config = provider_config_from_env(
        {
            "AZURE_OPENAI_ENDPOINT": "https://example.openai.azure.com/openai/v1/",
            "AZURE_OPENAI_API_KEY": "azure-key",
            "OPENAI_MODEL": "gpt-4.1",
            "OPENAI_API_KEY": "must-not-be-used",
        },
        require_source_aware_azure=True,
    )

    assert config.api_url == "https://example.openai.azure.com/openai/v1/chat/completions"
    assert config.api_key == "azure-key"
    assert config.model == "gpt-4.1"
    assert config.include_model is True


def test_provider_config_selects_inactive_luna_profile_without_switching_app() -> None:
    config = provider_config_from_env(
        {
            "OPENAI_MODEL": "gpt-4.1",
            "AZURE_OPENAI_ENDPOINT": "https://shared.openai.azure.com/openai/v1/",
            "AZURE_OPENAI_API_KEY": "shared-key",
            "AZURE_OPENAI_GPT56_LUNA_DEPLOYMENT": "gpt-5.6-luna",
            "AZURE_OPENAI_GPT56_LUNA_ENDPOINT": (
                "https://luna.openai.azure.com/openai/v1"
            ),
            "AZURE_OPENAI_GPT56_LUNA_API_KEY_PRIMARY": "luna-key",
        },
        model_override="gpt-5.6-luna",
    )

    assert config.model == "gpt-5.6-luna"
    assert config.api_key == "luna-key"
    assert config.api_url == "https://luna.openai.azure.com/openai/v1/chat/completions"


def test_terra_profile_can_reuse_shared_azure_resource() -> None:
    config = provider_config_from_env(
        {
            "OPENAI_MODEL": "gpt-4.1",
            "AZURE_OPENAI_ENDPOINT": "https://shared.openai.azure.com/openai/v1/",
            "AZURE_OPENAI_API_KEY": "shared-key",
        },
        model_override="gpt-5.6-terra",
        require_source_aware_azure=True,
    )

    assert config.model == "gpt-5.6-terra"
    assert config.api_key == "shared-key"
    assert config.api_url == "https://shared.openai.azure.com/openai/v1/chat/completions"


def test_gpt_5_request_omits_temperature_and_disables_reasoning() -> None:
    config = provider_config_from_env(
        {
            "AZURE_OPENAI_ENDPOINT": "https://example.openai.azure.com/openai/v1/",
            "AZURE_OPENAI_API_KEY": "azure-key",
        },
        model_override="gpt-5.6-luna",
    )
    client = OpenAIChatClient(config)

    body = client.request_body(
        messages=[{"role": "user", "content": "test"}],
        temperature=0.2,
        max_output_tokens=500,
    )

    assert "temperature" not in body
    assert "max_tokens" not in body
    assert body["max_completion_tokens"] == 500
    assert body["reasoning_effort"] == "none"
    assert body["model"] == "gpt-5.6-luna"
    assert client.effective_parameters(
        temperature=0.2, max_output_tokens=500
    ) == {"reasoningEffort": "none", "maxOutputTokens": 500}


def test_gpt_4_1_request_keeps_temperature_and_no_reasoning() -> None:
    config = provider_config_from_env(
        {
            "AZURE_OPENAI_ENDPOINT": "https://example.openai.azure.com/openai/v1/",
            "AZURE_OPENAI_API_KEY": "azure-key",
            "OPENAI_MODEL": "gpt-4.1",
        }
    )
    client = OpenAIChatClient(config)

    body = client.request_body(
        messages=[{"role": "user", "content": "test"}],
        temperature=0.2,
        max_output_tokens=500,
    )

    assert body["temperature"] == 0.2
    assert body["max_tokens"] == 500
    assert "max_completion_tokens" not in body
    assert "reasoning_effort" not in body
