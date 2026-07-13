from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator, Protocol


@dataclass(frozen=True)
class GenParams:
    """Параметры генерации, общие для провайдеров."""

    model: str
    temperature: float
    tools: tuple[str, ...] = ()  # включённые инструменты, напр. ("web_search",)
    # Усилие рассуждения ("low" | "medium" | "high") — согласованное со сценарием
    # значение (apps.ai.preferences). Провайдеры, чьи модели это поддерживают
    # нативно (OpenAI), передают его в API; остальные полагаются на текстовую
    # директиву в системном промпте (apps.ai.prompts). См. providers/_openai.py.
    reasoning_effort: str = "medium"
    # Жёсткий потолок длины ответа — финансовый предохранитель тарифа (см.
    # billing.limits.max_output_tokens). Желаемую длину по-прежнему задаём мягко
    # промптом; это ограничение сверху, чтобы дорогой тариф не жёг лишнее.
    max_output_tokens: int = 16384


class LLMProvider(Protocol):
    def stream(
        self,
        *,
        system: str,
        history: list[dict],
        params: GenParams,
        usage: dict,
    ) -> Iterator[str]:
        """Стримит ответ по кусочкам текста."""
        ...
