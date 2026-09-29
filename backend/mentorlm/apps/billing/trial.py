"""Суточный триал Plus: выдача демо платного тарифа и его состояние для ЛК.

Отдельный модуль, а не часть `payments.py` и не часть `plans.py`: в первом живут
деньги и ЮKassa, которых здесь нет вовсе, а второй объявлен как чистое чтение
(«какой тариф применять») и мутаций не содержит.

Триал — настоящая подписка со своим тарифом (`Plan.TRIAL`) и своей квотой, но
бесплатная и одноразовая. Из этого следуют два инварианта, которые нельзя
нарушать:

1. **Ни привязанной карты, ни `auto_renew`.** Как только бесплатный период сам
   превращается в списание, включаются ФЗ-376 и ст. 16.1 ЗоЗПП: выраженное
   согласие, уведомление за 24 часа, возврат при его отсутствии. Триал, который
   просто заканчивается, ничего из этого не требует.
2. **Цена тарифа — ноль** (проверяется `checks.billing.E010`). На этом держится
   то, что планировщик не пишет о триале писем о продлении: `_PAID_PLANS` в
   `billing_tick` считается как «тарифы дороже нуля».

По истечении делать ничего не нужно: `plans.effective_plan` перестаёт видеть
подписку с прошедшим `current_period_end` и возвращает Free. Ни cron, ни статуса
«истёк» здесь нет — именно потому, что тариф считается на лету.
"""

from __future__ import annotations

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from .limits import TRIAL_DURATION, limits_for
from .models import Plan, Subscription
from .plans import active_subscription


class TrialError(Exception):
    """Триал выдать нельзя: машинный код плюс текст для пользователя."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _existing(user) -> Subscription | None:
    """Строка триала этого пользователя, живая или уже истёкшая.

    Признак «триал уже был» — именно существование строки, а не её живость:
    истёкший триал остаётся `status=active` с прошедшей датой, а при покупке Plus
    его гасят в `canceled`. Оба состояния означают «демо человек уже получил».
    """
    return Subscription.objects.filter(user=user, plan=Plan.TRIAL).first()


def _is_alive(sub: Subscription, now=None) -> bool:
    """Действует ли эта подписка сейчас — по тем же правилам, что `plans`."""
    now = now or timezone.now()
    return (
        sub.status == Subscription.Status.ACTIVE
        and sub.current_period_end is not None
        and sub.current_period_end > now
    )


def trial_state(user) -> dict:
    """Состояние триала для интерфейса: можно ли взять, брал ли, до когда.

    Едет в `/api/me/subscription/`, а не отдельным запросом: тот эндпоинт и так
    загружается один раз на всё приложение, поэтому панель активации не стоит
    ни одного лишнего обращения к серверу.
    """
    existing = _existing(user)
    active = active_subscription(user)
    return {
        # Предложить триал можно, только если его ещё не брали И сейчас не
        # действует никакая подписка: платящему человеку демо не нужно.
        "trial_available": existing is None and active is None,
        "trial_used": existing is not None,
        "trial_ends_at": (
            existing.current_period_end.isoformat()
            if existing is not None and _is_alive(existing)
            else None
        ),
    }


def start_trial(user) -> tuple[Subscription, bool]:
    """Включить суточный триал Plus; вернуть подписку и признак «создана сейчас».

    Идемпотентно: повторный вызов при живом триале возвращает ту же подписку с
    `created=False`, а не заводит вторую и не продлевает срок. Двойное нажатие
    кнопки ломается здесь, а последний рубеж — констрейнт `one_trial_per_user`.
    """
    now = timezone.now()
    with transaction.atomic():
        existing = _existing(user)
        if existing is not None:
            if _is_alive(existing, now):
                return existing, False
            raise TrialError(
                "trial_used",
                "Пробный период уже был использован. "
                "Оформите подписку, чтобы продолжить с теми же возможностями.",
            )

        if active_subscription(user) is not None:
            # Строку НЕ создаём: триал не сгорает за то, что человек заплатил.
            # Если подписка когда-нибудь кончится, демо будет ещё доступно.
            raise TrialError(
                "trial_not_needed",
                "У вас уже действует подписка — пробный период не нужен.",
            )

        try:
            created = Subscription.objects.create(
                user=user,
                plan=Plan.TRIAL,
                status=Subscription.Status.ACTIVE,
                # Своё значение, а не "manual": руками его никто не выдавал.
                # Ветвлений по provider в коде нет, поле только показывается.
                provider="trial",
                current_period_start=now,
                current_period_end=now + TRIAL_DURATION,
                # Инвариант триала: списывать нечем и незачем. См. докстроку.
                auto_renew=False,
                auto_renew_requested=False,
                payment_method_id="",
                # Версию оферты фиксируем как у платных подписок: услуга
                # оказывается по ней же, просто бесплатно. IP здесь не пишем —
                # поле `auto_renew_consent_ip` существует для согласия на
                # списания, а его у триала нет и быть не может.
                offer_version=settings.OFFER_VERSION,
            )
            return created, True
        except IntegrityError:
            # Гонка двух одновременных запросов: констрейнт отсёк второй.
            # Перечитываем и отвечаем так же, как на повторное нажатие.
            existing = _existing(user)
            if existing is not None and _is_alive(existing, now):
                return existing, False
            raise TrialError(
                "trial_used", "Пробный период уже был использован."
            ) from None


def trial_label() -> str:
    """Название тарифа триала — из каталога, чтобы не расходилось с лимитами."""
    return limits_for(Plan.TRIAL)["label"]
