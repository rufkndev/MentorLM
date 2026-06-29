from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator, Protocol


@dataclass(frozen=True)
class GenParams:
    """Параметры генерации, общие для провайдеров."""

    model: str
    temperature: float
    response_length: str  # "short" | "balanced" | "detailed"


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
