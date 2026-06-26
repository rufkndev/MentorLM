from apps.users.models import UserProfile

PLAN_LIMITS = {
    UserProfile.Plan.FREE: {
        "daily_messages": 50,
        "context_tokens": 8_000,
        "label": "Бесплатный",
    },
    UserProfile.Plan.PRO: {
        "daily_messages": None,  # None = безлимит
        "context_tokens": 200_000,
        "label": "Pro",
    },
}


def limits_for(plan: str) -> dict:
    """Лимиты для плана; по умолчанию — Free."""
    return PLAN_LIMITS.get(plan, PLAN_LIMITS[UserProfile.Plan.FREE])
