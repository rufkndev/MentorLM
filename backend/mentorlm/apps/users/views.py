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
        return Response(UserProfileSerializer(request.user).data)

    def delete(self, request):
        """Удалить профиль и все связанные данные пользователя.

        Каскад (on_delete=CASCADE) стирает настройки, диалоги, сообщения,
        память и счётчики использования. Сам аккаунт Clerk удаляет клиент
        (user.delete()) — секретного ключа Clerk на бэкенде нет.
        """
        request.user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeSettingsView(APIView):
    """GET/PATCH /api/me/settings/ — чтение и частичное обновление настроек."""

    def _settings(self, request) -> UserSettings:
        # OneToOne гарантирован аутентификацией; подстрахуемся get_or_create.
        settings_obj, _ = UserSettings.objects.get_or_create(user=request.user)
        return settings_obj

    def get(self, request):
        return Response(UserSettingsSerializer(self._settings(request)).data)

    def patch(self, request):
        serializer = UserSettingsSerializer(
            self._settings(request), data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class MeSettingsDefaultsView(APIView):
    """GET /api/me/settings/defaults/ — канонические дефолты настроек.

    Значения выведены из модели UserSettings (единый источник), чтобы фронт не
    держал их копию. Фронт кэширует ответ и использует как базу для первого
    рендера/офлайна; при обычной загрузке значения перекрывает /api/me/settings/.
    """

    def get(self, request):
        return Response(settings_defaults())


def _window_view(used: int, limit, resets_at) -> dict:
    """Одно скользящее окно для ЛК: проценты + время начала восстановления.
    Абсолютные токены наружу не отдаём — только доля и момент сброса."""
    if limit is None:  # безлимит
        return {"used_pct": 0, "resets_at": None}
    used_pct = min(100, round(used / limit * 100)) if limit else 0
    return {
        "used_pct": used_pct,
        "resets_at": resets_at.isoformat() if used_pct > 0 else None,
    }


def _mode_usage(user, plan: str, mode: str, now) -> dict:
    """Расход режима по скользящим окнам + агрегат по самому забитому окну."""
    quota = quota_for(plan, mode)
    used = _window_usage(user, mode, now)

    windows = {}
    tightest, top_pct = None, -1
    for window, _ in QUOTA_WINDOWS.items():
        limit = quota.limit(window)
        resets_at = _window_reset(user, mode, window, now) if used[window] else now
        view = _window_view(used[window], limit, resets_at)
        windows[window] = view
        if view["used_pct"] > top_pct:
            tightest, top_pct = window, view["used_pct"]

    return {
        "label": MODE_LABEL.get(mode, mode).strip("«»"),
        "used_pct": max(0, top_pct),
        "remaining_pct": max(0, 100 - max(0, top_pct)),
        "tightest_window": tightest,
        "resets_at": windows[tightest]["resets_at"],
        "windows": windows,
    }


class UsageView(APIView):
    """GET /api/me/usage/ — расход по режимам в скользящих окнах.

    По каждому режиму (chat/code/research) — доля исчерпанной квоты по самому
    забитому окну (упрётся первым) и разбивка по окнам. Абсолютные токены
    пользователю не показываем — только проценты и время восстановления.
    """

    def get(self, request):
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
    """GET /api/me/subscription/ — текущий тариф, статус подписки и квоты."""

    def get(self, request):
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
