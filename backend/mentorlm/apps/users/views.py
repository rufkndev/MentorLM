from datetime import date

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.limits import limits_for
from apps.usage.models import Usage

from .models import UserSettings
from .serializers import UserProfileSerializer, UserSettingsSerializer


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
    """GET /api/me/usage/ — использование за сегодня + лимит тарифа.

    Заглушка-MVP: реального учёта пока нет, поэтому при отсутствии строки за
    сегодня отдаём нули. Структура ответа финальная.
    """

    def get(self, request):
        plan_limits = limits_for(request.user.plan)
        today = Usage.objects.filter(user=request.user, day=date.today()).first()
        return Response(
            {
                "day": date.today().isoformat(),
                "request_count": today.request_count if today else 0,
                "tokens_in": today.tokens_in if today else 0,
                "tokens_out": today.tokens_out if today else 0,
                "cost_rub": str(today.cost_rub) if today else "0",
                "daily_limit": plan_limits["daily_messages"],
            }
        )


class SubscriptionView(APIView):
    """GET /api/me/subscription/ — текущий тариф и его лимиты.

    Заглушка-MVP: тариф берём из закэшированного UserProfile.plan; полная
    история платежей и управление подпиской появятся с биллингом (YooKassa).
    """

    def get(self, request):
        plan = request.user.plan
        plan_limits = limits_for(plan)
        return Response(
            {
                "plan": plan,
                "plan_label": plan_limits["label"],
                "daily_messages": plan_limits["daily_messages"],
                "context_tokens": plan_limits["context_tokens"],
            },
            status=status.HTTP_200_OK,
        )
