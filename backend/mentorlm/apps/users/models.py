"""Пользователь: профиль-зеркало Clerk и его продуктовые настройки (1:1).

Варианты и дефолты настроек берём из ai.preferences, чтобы они не разъезжались
с логикой, которая их применяет.
"""

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

    Источник правды об авторизации — Clerk; у себя храним запись, привязанную к
    нему по `clerk_id`, и доменные поля приложения.
    """

    # Поля plan здесь нет: тариф — статус подписки (billing.Subscription),
    # считается на лету через effective_plan. Перечень тарифов — billing.Plan.
    clerk_id = models.CharField(max_length=255, unique=True, db_index=True)
    email = models.EmailField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Профиль пользователя"
        verbose_name_plural = "Профили пользователей"

    # После ClerkJWTAuthentication именно UserProfile становится request.user,
    # хотя это не django.contrib.auth.User — два свойства ниже нужны, чтобы
    # DRF-пермишен IsAuthenticated пропускал такие запросы.
    @property
    def is_authenticated(self) -> bool:
        """Всегда True: анонимные запросы до профиля не доходят."""
        return True

    @property
    def is_anonymous(self) -> bool:
        """Всегда False — зеркальная пара к is_authenticated."""
        return False

    def __str__(self) -> str:
        return self.email or self.clerk_id


class UserSettings(models.Model):
    """Настройки пользователя; поля сгруппированы по вкладкам раздела «Настройки».

    Параметры модели — мягкий слой: они не диктуют значения, а сдвигают базу
    сценария в его границах (см. ai.preferences).
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
    # Автоудаление диалогов по последней активности; 0 — не удалять. Чистка
    # ленивая, при запросе списка чатов (conversations.views).
    chat_retention_days = models.PositiveIntegerField(
        choices=RETENTION_CHOICES, default=DEFAULTS["chat_retention_days"]
    )

    # — Параметры модели ИИ —
    # Модель выбирается продуктовым тиром (default/fast/quality), реальный id
    # подставляет ai.preferences. Креативность, длина и глубина — мягкие сдвиги.
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
    # Свободные поля идут в промпт строками персонализации, переключатели
    # памяти — в apps.memory.
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
