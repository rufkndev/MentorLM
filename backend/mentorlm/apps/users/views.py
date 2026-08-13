"""Личный кабинет: профиль, настройки, расход по режимам и статус подписки."""

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.guard import _window_reset, _window_usage
from apps.billing.limits import MODE_LABEL, QUOTA_WINDOWS, limits_for, quota_for
from apps.billing.plans import active_subscription, effective_plan

from .models import UserSettings
from .serializers import (
    UserProfileSerializer,
    UserSettingsSerializer,
    settings_defaults,
)

# Режимы, по которым показываем расход в ЛК.
_USAGE_MODES = ("chat", "code", "research")


class MeView(APIView):
    """GET /api/me/ — профиль текущего пользователя; DELETE — удалить аккаунт."""

    def get(self, request):
        """Профиль вместе с действующим тарифом."""
        return Response(UserProfileSerializer(request.user).data)

    def delete(self, request):
        """Удалить аккаунт и все связанные данные.

        Каскад стирает настройки, диалоги, сообщения, память, счётчики и
        refresh-токены — то есть все сессии закрываются сами собой. Это же
        реализация права на удаление ПДн (152-ФЗ), поэтому удаление настоящее,
        а не пометка «неактивен».
        """
        request.user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeSettingsView(APIView):
    """GET/PATCH /api/me/settings/ — чтение и частичное обновление настроек."""

    def _settings(self, request) -> UserSettings:
        """Настройки пользователя; аутентификация их создаёт, но подстрахуемся."""
        settings_obj, _ = UserSettings.objects.get_or_create(user=request.user)
        return settings_obj

    def get(self, request):
        """Текущие настройки целиком."""
        return Response(UserSettingsSerializer(self._settings(request)).data)

    def patch(self, request):
        """Частичное обновление: фронт шлёт только изменённые поля."""
        serializer = UserSettingsSerializer(
            self._settings(request), data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class MeSettingsDefaultsView(APIView):
    """GET /api/me/settings/defaults/ — канонические дефолты настроек.

    Значения выводятся из модели, чтобы фронт не держал их копию: он кэширует
    ответ для первого рендера, а затем перекрывает его /api/me/settings/.
    """

    def get(self, request):
        """Словарь «поле → значение по умолчанию»."""
        return Response(settings_defaults())


def _window_view(used: int, limit, resets_at, human: str) -> dict:
    """Одно скользящее окно для ЛК: доля расхода и момент восстановления.

    Абсолютные токены наружу не отдаём. Время возвращаем при любом расходе,
    даже если доля округлилась до 0% — иначе на малом расходе оно бы пропадало.
    """
    if limit is None:  # безлимит
        return {"used_pct": 0, "resets_at": None, "window_label": human}
    used_pct = min(100, round(used / limit * 100)) if limit else 0
    return {
        "used_pct": used_pct,
        "resets_at": resets_at.isoformat() if used > 0 else None,
        "window_label": human,
    }


def _mode_usage(user, plan: str, mode: str, now) -> dict:
    """Расход режима по окнам плюс агрегат по самому забитому из них."""
    quota = quota_for(plan, mode)
    used = _window_usage(user, mode, now)

    windows = {}
    tightest, top_pct = None, -1
    for window, (_, human) in QUOTA_WINDOWS.items():
        limit = quota.limit(window)
        resets_at = _window_reset(user, mode, window, now) if used[window] else now
        view = _window_view(used[window], limit, resets_at, human)
        windows[window] = view
        if view["used_pct"] > top_pct:
            tightest, top_pct = window, view["used_pct"]

    return {
        "label": MODE_LABEL.get(mode, mode).strip("«»"),
        "used_pct": max(0, top_pct),
        "remaining_pct": max(0, 100 - max(0, top_pct)),
        "tightest_window": tightest,
        "resets_at": windows[tightest]["resets_at"],
        "window_label": windows[tightest]["window_label"],
        "windows": windows,
    }


class UsageView(APIView):
    """GET /api/me/usage/ — расход по режимам в скользящих окнах.

    По каждому режиму отдаём долю самого забитого окна (оно упрётся первым) и
    разбивку по окнам — в процентах, без абсолютных чисел.
    """

    def get(self, request):
        """Сводка расхода по всем режимам на текущем тарифе."""
        user = request.user
        plan = effective_plan(user)
        now = timezone.now()
        return Response(
            {
                "plan": plan,
                "plan_label": limits_for(plan)["label"],
                "modes": {
                    mode: _mode_usage(user, plan, mode, now)
                    for mode in _USAGE_MODES
                },
            }
        )


class SubscriptionView(APIView):
    """GET /api/me/subscription/ — тариф, статус подписки и что он даёт."""

    def get(self, request):
        """Действующий план с его возможностями и квотами по режимам."""
        user = request.user
        plan = effective_plan(user)
        limits = limits_for(plan)
        sub = active_subscription(user)
        return Response(
            {
                "plan": plan,
                "plan_label": limits["label"],
                "status": sub.status if sub else "none",
                "provider": sub.provider if sub else None,
                "current_period_end": (
                    sub.current_period_end.isoformat()
                    if sub and sub.current_period_end
                    else None
                ),
                "allow_web_search": limits["allow_web_search"],
                "allow_memory": limits["allow_memory"],
                "context_messages": limits["context_messages"],
                "max_attachments": limits["max_attachments"],
                "allowed_tiers": sorted(limits["allowed_tiers"]),
                "quotas": {
                    mode: {"burst": q.burst, "week": q.week}
                    for mode, q in limits["quotas"].items()
                },
            },
            status=status.HTTP_200_OK,
        )
