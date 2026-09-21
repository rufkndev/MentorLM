"""Проверка каталога экономики на старте.

`limits.py` — один файл, который правят руками, когда меняют модель или крутят
тарифы. Почти все ошибки в нём тихие: модель без цены считается по
`DEFAULT_PRICE`, режим без доли в `_MODE_SHARES` остаётся без квоты, тир,
которого нет в UI, недостижим. Ни одна из них не падает — они просто дают
неверные деньги, и заметить это можно только по счёту от провайдера.

Поэтому каталог проверяется системными проверками Django. Они выполняются на
`runserver`, `manage.py check` и `migrate`, а в проде `Dockerfile.prod` зовёт
`migrate --noinput` ДО `exec gunicorn` — значит рассогласованный каталог роняет
контейнер на старте, ровно как `prod.py` роняет процесс без `DJANGO_SECRET_KEY`.
"""

from __future__ import annotations

from django.core.checks import Error, Warning

from . import limits
from .models import Plan

# Словари, которые обязаны описывать один и тот же набор режимов. Режим, забытый
# в любом из них, получает молчаливый фолбэк вместо своей настройки.
_MODE_DICTS = (
    ("_MODE_SHARES", "доля в месячном бюджете тарифа"),
    ("MODE_LABEL", "подпись режима в сообщениях о лимитах"),
    ("REQUEST_TIMEOUT_SECONDS", "таймаут генерации"),
    ("DEGRADE_REQUESTS", "число grace-запросов на деградации"),
)


def check_economics(app_configs, **kwargs):
    """Согласован ли каталог моделей с ценами, режимами, тирами и тарифами."""
    errors: list[Error | Warning] = []
    errors += _check_models_priced()
    errors += _check_providers()
    errors += _check_modes_described()
    errors += _check_tiers()
    errors += _check_plans()
    return errors


def _check_models_priced() -> list[Error | Warning]:
    """У каждой модели, которую можем вызвать, должна быть цена."""
    out: list[Error | Warning] = []

    missing = sorted(limits.referenced_models() - set(limits.MODELS))
    if missing:
        out.append(
            Error(
                "Модели из MODES/MEMORY_MODEL нет в MODELS: "
                + ", ".join(missing),
                hint=(
                    "Добавьте строку с ценой в limits.MODELS. Без неё расход по "
                    "этой модели считался бы по DEFAULT_PRICE, то есть неверно."
                ),
                obj="apps.billing.limits.MODELS",
                id="billing.E001",
            )
        )

    # DEFAULT_PRICE — цена модели, которую из каталога убрали. Если она ниже
    # реальных, «забыть модель» становится способом считать расход дешевле.
    if limits.MODELS:
        top_in = max(price.input for price in limits.MODELS.values())
        top_out = max(price.output for price in limits.MODELS.values())
        if limits.DEFAULT_PRICE.input < top_in or limits.DEFAULT_PRICE.output < top_out:
            out.append(
                Warning(
                    f"DEFAULT_PRICE {tuple(limits.DEFAULT_PRICE)} ниже самой "
                    f"дорогой модели каталога ({top_in}, {top_out}).",
                    hint=(
                        "Модель, убранная из MODELS, окажется дешевле оставшихся. "
                        "Поднимите DEFAULT_PRICE до потолка каталога."
                    ),
                    obj="apps.billing.limits.DEFAULT_PRICE",
                    id="billing.W001",
                )
            )
    return out


def _check_providers() -> list[Error | Warning]:
    """Провайдер режима должен существовать в ai.providers."""
    from apps.ai.providers import _PROVIDERS

    unknown = sorted(
        {cfg.provider for cfg in limits.MODES.values()} - set(_PROVIDERS)
    )
    if not unknown:
        return []
    return [
        Error(
            "Неизвестный провайдер в MODES: " + ", ".join(unknown),
            hint=f"Доступны: {', '.join(sorted(_PROVIDERS))}.",
            obj="apps.billing.limits.MODES",
            id="billing.E002",
        )
    ]


def _check_modes_described() -> list[Error | Warning]:
    """Каждый режим каталога должен быть описан во всех словарях режимов."""
    out: list[Error | Warning] = []
    modes = set(limits.MODES)

    for name, what in _MODE_DICTS:
        described = set(getattr(limits, name))
        if missing := sorted(modes - described):
            out.append(
                Error(
                    f"В {name} нет режимов: {', '.join(missing)} ({what}).",
                    hint="Режим без своей строки молча получает общий фолбэк.",
                    obj=f"apps.billing.limits.{name}",
                    id="billing.E003",
                )
            )
        if extra := sorted(described - modes):
            out.append(
                Warning(
                    f"В {name} есть режимы, которых нет в MODES: "
                    + ", ".join(extra),
                    hint="Остаток от удалённого режима — уберите строку.",
                    obj=f"apps.billing.limits.{name}",
                    id="billing.W002",
                )
            )

    # Доли режимов делят месячный бюджет тарифа: сумма ≠ 1 тихо меняет квоты.
    total = sum(limits._MODE_SHARES.values())
    if abs(total - 1.0) > 1e-9:
        out.append(
            Error(
                f"Сумма долей режимов _MODE_SHARES = {total}, должна быть 1.",
                hint="Доли делят месячный бюджет тарифа между режимами.",
                obj="apps.billing.limits._MODE_SHARES",
                id="billing.E004",
            )
        )
    return out


def _check_tiers() -> list[Error | Warning]:
    """Тиры каталога, UI и тарифов — один и тот же набор."""
    from apps.ai.preferences import MODEL_TIER_CHOICES

    out: list[Error | Warning] = []
    tiers = set(limits.TIERS)

    ui = {value for value, _ in MODEL_TIER_CHOICES}
    if ui != tiers:
        out.append(
            Error(
                f"Тиры UI {sorted(ui)} не совпадают с limits.TIERS "
                f"{sorted(tiers)}.",
                hint=(
                    "MODEL_TIER_CHOICES (подписи и choices UserSettings) и "
                    "TIERS (поля ModeModels) описывают одно и то же."
                ),
                obj="apps.ai.preferences.MODEL_TIER_CHOICES",
                id="billing.E005",
            )
        )

    for plan, plan_limits in limits.PLAN_LIMITS.items():
        if unknown := sorted(set(plan_limits["allowed_tiers"]) - tiers):
            out.append(
                Error(
                    f"Тариф {plan}: неизвестные тиры в allowed_tiers: "
                    + ", ".join(unknown),
                    obj="apps.billing.limits.PLAN_LIMITS",
                    id="billing.E006",
                )
            )
    return out


def _check_plans() -> list[Error | Warning]:
    """Каждый тариф должен иметь и лимиты, и цену."""
    out: list[Error | Warning] = []
    plans = set(Plan.values)

    if missing := sorted(plans - set(limits.PLAN_LIMITS)):
        out.append(
            Error(
                "В PLAN_LIMITS нет тарифов: " + ", ".join(missing),
                hint="limits_for() отдаст им лимиты Free.",
                obj="apps.billing.limits.PLAN_LIMITS",
                id="billing.E007",
            )
        )
    if missing := sorted(plans - set(limits.PLAN_PRICE_RUB)):
        out.append(
            Error(
                "В PLAN_PRICE_RUB нет тарифов: " + ", ".join(missing),
                hint="plan_price() отдаст 0 — тариф станет бесплатным.",
                obj="apps.billing.limits.PLAN_PRICE_RUB",
                id="billing.E008",
            )
        )

    # Веб-поиск живёт в «Исследовать»: обещать его при нулевой квоте режима —
    # продать функцию, которой нельзя воспользоваться.
    for plan, plan_limits in limits.PLAN_LIMITS.items():
        quota = plan_limits["quotas"].get("research")
        if plan_limits["allow_web_search"] and quota and not quota.week:
            out.append(
                Warning(
                    f"Тариф {plan}: allow_web_search=True при нулевой недельной "
                    "квоте режима «Исследовать».",
                    obj="apps.billing.limits.PLAN_LIMITS",
                    id="billing.W003",
                )
            )
    return out
