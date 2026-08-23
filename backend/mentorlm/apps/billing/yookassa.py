"""Клиент ЮKassa — единственное место, где живёт HTTP-контракт с провайдером.

Тонкая обёртка над `httpx` вместо официального SDK. Причина одна и важная: SDK
прячет генерацию `Idempotence-Key` внутри себя, а здесь именно ключом
управляется, спишутся деньги один раз или два. Всё остальное в API ЮKassa —
это POST с JSON и basic-авторизацией, ради которого не стоит тянуть вторую
HTTP-библиотеку в зависимости.

Три правила, которые нельзя нарушать, и все три из документации:

* **`Idempotence-Key` обязателен на каждом POST и не меняется при повторе.**
  Ответ на первый запрос с этим ключом ЮKassa запомнит и вернёт его же на
  повторный. Сгенерировать новый ключ при ретрае — значит создать второй платёж
  и списать деньги дважды. Поэтому ключ приходит СНАРУЖИ, из строки `Payment`,
  а не рождается здесь.
* **`202 Accepted` — не ошибка.** Это «запрос принят, но ещё обрабатывается»;
  в теле приходит `retry_after` (мс). Надо подождать и повторить тем же ключом.
* **⚠️ Прокси не используется.** `LLM_PROXY_URL` существует ради OpenAI и
  Anthropic, которые не отвечают российским адресам. ЮKassa — российский хост,
  и запрос к ней через зарубежный прокси в лучшем случае замедлится, в худшем
  будет отклонён. Ходим напрямую.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx
from django.conf import settings

logger = logging.getLogger(__name__)

API_ROOT = "https://api.yookassa.ru/v3"

# Платёж — операция с деньгами: лучше подождать, чем оборвать на середине и не
# узнать результат. Отдельно connect: недоступность хоста видна сразу.
TIMEOUT = httpx.Timeout(30.0, connect=10.0)

# Сетевой сбой и 5xx повторяем — ТЕМ ЖЕ ключом идемпотентности, поэтому повтор
# безопасен. Больше трёх попыток смысла не имеет: вызывающий код всё равно
# досинхронизирует платёж позже (payments.sync_payment).
MAX_ATTEMPTS = 3
RETRY_BACKOFF_SECONDS = 1.5

# Потолок ожидания по 202: ЮKassa просит подождать retry_after миллисекунд, но
# доверять чужому числу без ограничения нельзя — оно держит поток воркера.
MAX_RETRY_AFTER_SECONDS = 5.0


class YooKassaError(Exception):
    """Ошибка обращения к ЮKassa.

    `retryable` отвечает на единственный вопрос, который волнует вызывающего:
    имеет ли смысл повторить позже (сеть, 5xx) или ответ окончательный и
    повтор ничего не изменит (неверный запрос, отклонённая карта).
    """

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        code: str = "",
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.retryable = retryable


def _auth() -> tuple[str, str]:
    """Пара для basic-авторизации; отсутствие ключей — ошибка конфигурации."""
    shop_id = settings.YOOKASSA_SHOP_ID
    secret = settings.YOOKASSA_SECRET_KEY
    if not shop_id or not secret:
        # В проде сюда не попасть — settings/prod.py требует обе переменные на
        # старте. Это защита для dev, где ключей может не быть вовсе.
        raise YooKassaError(
            "Не заданы YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY — платежи отключены"
        )
    return shop_id, secret


def _error_from(response: httpx.Response) -> YooKassaError:
    """Разобрать ответ с ошибкой в исключение с внятным текстом."""
    try:
        body = response.json()
    except ValueError:
        body = {}
    code = str(body.get("code", ""))
    description = body.get("description") or response.text[:200]
    # 5xx — временная проблема на стороне провайдера, 4xx — наш запрос или
    # решение банка: повторять его бессмысленно.
    retryable = response.status_code >= 500
    return YooKassaError(
        f"ЮKassa {response.status_code}: {description}",
        status_code=response.status_code,
        code=code,
        retryable=retryable,
    )


def _request(
    method: str,
    path: str,
    *,
    json: dict | None = None,
    idempotence_key: str | None = None,
) -> dict[str, Any]:
    """Выполнить запрос к API и вернуть разобранный JSON.

    Повторы делаются здесь и только здесь: снаружи вызов выглядит как один
    поход, который либо получился, либо кончился `YooKassaError`.
    """
    headers = {"Content-Type": "application/json"}
    if idempotence_key:
        headers["Idempotence-Key"] = str(idempotence_key)

    url = f"{API_ROOT}{path}"
    last_error: YooKassaError | None = None

    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            with httpx.Client(timeout=TIMEOUT, auth=_auth()) as client:
                response = client.request(method, url, json=json, headers=headers)
        except httpx.HTTPError as exc:
            # Сеть отвалилась. Платёж при этом мог быть создан — повтор с тем же
            # ключом либо вернёт его, либо создаст, но не задвоит.
            last_error = YooKassaError(
                f"Сеть недоступна при обращении к ЮKassa: {exc}", retryable=True
            )
            logger.warning("ЮKassa %s %s — попытка %s: %s", method, path, attempt, exc)
        else:
            if response.status_code == 202:
                # «Ещё обрабатывается»: подождать столько, сколько попросили, и
                # повторить. Это штатный ответ, а не сбой.
                body = response.json() if response.content else {}
                delay = min(
                    float(body.get("retry_after", 1000)) / 1000.0,
                    MAX_RETRY_AFTER_SECONDS,
                )
                logger.info("ЮKassa просит повторить через %.1f с", delay)
                time.sleep(delay)
                continue

            if response.is_success:
                return response.json()

            error = _error_from(response)
            if not error.retryable:
                raise error
            last_error = error
            logger.warning("ЮKassa %s %s — попытка %s: %s", method, path, attempt, error)

        if attempt < MAX_ATTEMPTS:
            time.sleep(RETRY_BACKOFF_SECONDS * attempt)

    raise last_error or YooKassaError("ЮKassa не ответила", retryable=True)


# ── Платежи ───────────────────────────────────────────────────────────────────


def create_payment(payload: dict, *, idempotence_key: str) -> dict[str, Any]:
    """Создать платёж. `idempotence_key` — из строки Payment, не случайный."""
    return _request("POST", "/payments", json=payload, idempotence_key=idempotence_key)


def get_payment(payment_id: str) -> dict[str, Any]:
    """Актуальное состояние платежа.

    Нужен не только для опроса: по документации после уведомления вебхука
    состояние полагается перечитать отсюда, а не верить телу уведомления.
    """
    return _request("GET", f"/payments/{payment_id}")


# ── Возвраты ──────────────────────────────────────────────────────────────────


def create_refund(payload: dict, *, idempotence_key: str) -> dict[str, Any]:
    """Вернуть деньги по платежу (полностью или частично)."""
    return _request("POST", "/refunds", json=payload, idempotence_key=idempotence_key)


def get_refund(refund_id: str) -> dict[str, Any]:
    """Актуальное состояние возврата."""
    return _request("GET", f"/refunds/{refund_id}")
