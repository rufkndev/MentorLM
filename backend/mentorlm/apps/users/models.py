from django.db import models

from apps.ai.preferences import (
    CONTEXT_DEPTH_CHOICES,
    CREATIVITY_CHOICES,
    DEFAULTS,
    EDUCATION_LEVEL_CHOICES,
    MEMORY_SCOPE_CHOICES,
    MEMORY_USE_CHOICES,
    MODEL_TIER_CHOICES,
    REASONING_DEPTH_CHOICES,
    RESPONSE_LENGTH_PREF_CHOICES,
    RETENTION_CHOICES,
)


class UserProfile(models.Model):
    """Локальное отражение пользователя Clerk.

    Источник правды об авторизации — Clerk; в своей БД мы храним запись,
    привязанную к Clerk по `clerk_id`, и доменные поля приложения.
    """

    # Перечень тарифов. Само поле plan в профиле НЕ храним: тариф — это статус
    # подписки (billing.Subscription), считается на лету через effective_plan.
    # Enum остаётся ключами тарифных словарей (billing.limits.PLAN_LIMITS).
    class Plan(models.TextChoices):
        FREE = "free", "Бесплатный"
        PLUS = "plus", "Plus"
        PRO = "pro", "Pro"

    clerk_id = models.CharField(max_length=255, unique=True, db_index=True)
    email = models.EmailField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Профиль пользователя"
        verbose_name_plural = "Профили пользователей"

    # UserProfile — не django.contrib.auth.User, но именно он становится
    # request.user после ClerkJWTAuthentication. Чтобы DRF-пермишен
    # IsAuthenticated пропускал такие запросы, отдаём True.
    @property
    def is_authenticated(self) -> bool:
        return True

    @property
    def is_anonymous(self) -> bool:
        return False

    def __str__(self) -> str:
        return self.email or self.clerk_id


class UserSettings(models.Model):
    """Продуктовые и ИИ-настройки пользователя (1:1 с профилем).

    Поля сгруппированы по вкладкам раздела «Настройки» на фронте:
    внешний вид/поведение, параметры модели и память/инструкции.
    """

    class Theme(models.TextChoices):
        SYSTEM = "system", "Системная"
        LIGHT = "light", "Светлая"
        DARK = "dark", "Тёмная"

    class FontSize(models.TextChoices):
        SM = "sm", "Мелкий"
        MD = "md", "Средний"
        LG = "lg", "Крупный"

    user = models.OneToOneField(
        UserProfile,
        on_delete=models.CASCADE,
        related_name="settings",
    )

    # — Внешний вид и поведение интерфейса —
    theme = models.CharField(
        max_length=20, choices=Theme.choices, default=Theme.SYSTEM
    )
    font_size = models.CharField(
        max_length=10, choices=FontSize.choices, default=FontSize.MD
    )

    # — Данные —
    # Автоудаление диалогов старше N дней (по последней активности). 0 — не удалять.
    # Значения из RETENTION_CHOICES; чистка ленивая (при запросе списка чатов).
    chat_retention_days = models.PositiveIntegerField(
        choices=RETENTION_CHOICES, default=DEFAULTS["chat_retention_days"]
    )

    # — Параметры модели ИИ —
    # Выбор модели по режимам — продуктовые тиры (default/fast/quality), бэк
    # маппит в реальные id (apps.ai.preferences). Креативность/длина/глубина —
    # мягкие сдвиги поверх сценария, а не жёсткие значения (не перекрывают
    # сценарий и им не перекрываются — согласуются в preferences.resolve_*).
    chat_model = models.CharField(
        max_length=20, choices=MODEL_TIER_CHOICES, default=DEFAULTS["chat_model"]
    )
    code_model = models.CharField(
        max_length=20, choices=MODEL_TIER_CHOICES, default=DEFAULTS["code_model"]
    )
    research_model = models.CharField(
        max_length=20, choices=MODEL_TIER_CHOICES, default=DEFAULTS["research_model"]
    )
    creativity = models.CharField(
        max_length=20, choices=CREATIVITY_CHOICES, default=DEFAULTS["creativity"]
    )
    response_length_preference = models.CharField(
        max_length=20,
        choices=RESPONSE_LENGTH_PREF_CHOICES,
        default=DEFAULTS["response_length_preference"],
    )
    reasoning_depth = models.CharField(
        max_length=20,
        choices=REASONING_DEPTH_CHOICES,
        default=DEFAULTS["reasoning_depth"],
    )

    # — Память и персональные инструкции —
    nickname = models.CharField(max_length=100, blank=True)
    occupation = models.CharField(max_length=150, blank=True)
    education_level = models.CharField(
        max_length=20,
        choices=EDUCATION_LEVEL_CHOICES,
        blank=True,
        default=DEFAULTS["education_level"],
    )
    field_of_study = models.CharField(max_length=150, blank=True)
    learning_goals = models.TextField(blank=True)
    custom_about = models.TextField(blank=True)
    custom_style = models.TextField(blank=True)
    context_depth = models.CharField(
        max_length=20,
        choices=CONTEXT_DEPTH_CHOICES,
        default=DEFAULTS["context_depth"],
    )
    auto_memory = models.BooleanField(default=DEFAULTS["auto_memory"])
    memory_scope = models.CharField(
        max_length=20, choices=MEMORY_SCOPE_CHOICES, default=DEFAULTS["memory_scope"]
    )
    memory_use = models.CharField(
        max_length=20, choices=MEMORY_USE_CHOICES, default=DEFAULTS["memory_use"]
    )

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Настройки пользователя"
        verbose_name_plural = "Настройки пользователей"

    def __str__(self) -> str:
        return f"Настройки {self.user}"
