"""Контракт провайдера: параметры генерации и интерфейс потокового ответа."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator, Protocol


@dataclass(frozen=True)
class GenParams:
    """Параметры генерации, общие для всех провайдеров."""

    model: str
    temperature: float
    tools: tuple[str, ...] = ()  # включённые инструменты, напр. ("web_search",)
    # "low" | "medium" | "high". Модели OpenAI получают это нативно, остальные —
    # текстовой директивой в системном промпте (ai.prompts).
    reasoning_effort: str = "medium"
    # Потолок длины ответа: предохранитель от runaway-генерации, а не цель —
    # желаемую длину задаём промптом.
    max_output_tokens: int = 16384


class LLMProvider(Protocol):
    """Интерфейс провайдера: один метод — стрим ответа."""

    def stream(
        self,
        *,
        system: str,
        history: list[dict],
        params: GenParams,
        usage: dict,
    ) -> Iterator[str]:
        """Отдаёт ответ кусочками текста и заполняет `usage` по ходу стрима."""
        ...
