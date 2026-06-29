"""Провайдеры LLM. Выбор по ключу из реестра режимов."""

from __future__ import annotations

from .base import GenParams, LLMProvider
from .anthropic import AnthropicProvider
from .openai_chat import OpenAIChatProvider
from .openai_research import OpenAIResearchProvider

_PROVIDERS: dict[str, LLMProvider] = {
    "openai_chat": OpenAIChatProvider(),
    "anthropic": AnthropicProvider(),
    "openai_research": OpenAIResearchProvider(),
}


def get_provider(key: str) -> LLMProvider:
    provider = _PROVIDERS.get(key)
    if provider is None:
        raise ValueError(f"Неизвестный провайдер: {key}")
    return provider


__all__ = ["GenParams", "LLMProvider", "get_provider"]
