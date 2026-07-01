from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator, Protocol


@dataclass(frozen=True)
class GenParams:
    """Параметры генерации, общие для провайдеров."""

    model: str
    temperature: float
    # Длину ответа задаём промптом (см. prompts.py), а не лимитом токенов, чтобы
    # ответ никогда не обрывался — поэтому max_tokens здесь нет.
    tools: tuple[str, ...] = ()  # включённые инструменты, напр. ("web_search",)


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
