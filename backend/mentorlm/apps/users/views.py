from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.limits import limits_for
from apps.billing.plans import effective_plan
from apps.usage.models import Usage

from .models import UserSettings
from .serializers import UserProfileSerializer, UserSettingsSerializer


def _next_day_iso() -> str:
    """Полночь следующего дня — когда обновятся дневные счётчики."""
    tomorrow = date.today() + timedelta(days=1)
    return timezone.make_aware(datetime.combine(tomorrow, time.min)).isoformat()


def _next_month_iso() -> str:
    """Начало следующего месяца — когда обновится месячный бюджет."""
    today = date.today()
    nxt = (today.replace(day=1) + timedelta(days=32)).replace(day=1)
    return timezone.make_aware(datetime.combine(nxt, time.min)).isoformat()


class MeView(APIView):
    """GET /api/me/ — профиль текущего пользователя (тариф, дата регистрации)."""

    def get(self, request):
        return Response(UserProfileSerializer(request.user).data)


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


class UsageView(APIView):
    """GET /api/me/usage/ — понятные пользователю индикаторы расхода.

    Считаем из дневных агрегатов Usage: остаток месячного бюджета (в %),
    сообщения/research/code за сегодня против лимитов тарифа и время сброса.
    Токены/рубли пользователю не показываем — только человекочитаемые счётчики.
    """

    def get(self, request):
        user = request.user
        plan = effective_plan(user)
        limits = limits_for(plan)

        today = date.today()
        rows = list(Usage.objects.filter(user=user, day=today))
        per_mode = {r.mode: r.request_count for r in rows}
        messages_used = sum(per_mode.values())

        month_start = today.replace(day=1)
        used_rub = sum(
            (r.cost_rub for r in Usage.objects.filter(user=user, day__gte=month_start)),
            Decimal("0"),
        )
        budget = limits["monthly_cost_rub"]
        used_pct = (
            int(min(Decimal("100"), used_rub / budget * 100)) if budget else 0
        )

        def line(used: int, limit) -> dict:
            return {"used": used, "limit": limit}

        return Response(
            {
                "plan": plan,
                "plan_label": limits["label"],
                "monthly": {
                    "used_pct": used_pct,
                    "remaining_pct": max(0, 100 - used_pct),
                    "resets_at": _next_month_iso(),
                },
                "daily": {
                    "messages": line(messages_used, limits["daily_messages"]),
                    "research": line(
                        per_mode.get("research", 0), limits["daily_research"]
                    ),
                    "code": line(per_mode.get("code", 0), limits["daily_code"]),
                    "resets_at": _next_day_iso(),
                },
            }
        )


class SubscriptionView(APIView):
    """GET /api/me/subscription/ — текущий тариф и его лимиты.

    Тариф берём через effective_plan (учтёт статус подписки, когда появится
    биллинг). Полная история платежей — с YooKassa позже.
    """

    def get(self, request):
        plan = effective_plan(request.user)
        limits = limits_for(plan)
        return Response(
            {
                "plan": plan,
                "plan_label": limits["label"],
                "daily_messages": limits["daily_messages"],
                "context_tokens": limits["context_tokens"],
                "monthly_cost_rub": str(limits["monthly_cost_rub"]),
            },
            status=status.HTTP_200_OK,
        )
