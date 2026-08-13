"""Пользователь: учётная запись, её продуктовые настройки (1:1) и refresh-токены.

Варианты и дефолты настроек берём из ai.preferences, чтобы они не разъезжались
с логикой, которая их применяет.
"""

from django.contrib.auth.hashers import check_password, make_password
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
    """Учётная запись пользователя приложения.

    Своя, а не внешнего провайдера: по 152-ФЗ (ч.5 ст.18) персональные данные
    граждан РФ должны записываться и храниться в базах на территории России.
    Логин — email, пароль хранится только хэшем.

    Это не django.contrib.auth.User: тот отвечает исключительно за вход в
    админку. Два контура намеренно разделены — учётка админа не должна быть
    учёткой пользователя продукта.
    """

    # Поля plan здесь нет: тариф — статус подписки (billing.Subscription),
    # считается на лету через effective_plan. Перечень тарифов — billing.Plan.
    email = models.EmailField(unique=True, db_index=True)
    # Хэш Django (по умолчанию PBKDF2), а не пароль. 128 символов — стандартная
    # ширина поля auth.User, её хватает любому алгоритму из HASHERS.
    password = models.CharField(max_length=128)
    # Блокировка без удаления: данные остаются, войти нельзя.
    is_active = models.BooleanField(default=True)
    # Пока писем не шлём (нет почтового провайдера) — задел под подтверждение.
    email_verified = models.BooleanField(default=False)
    last_login_at = models.DateTimeField(null=True, blank=True)

    # — Согласие на обработку ПДн (152-ФЗ) —
    # Согласие нужно уметь доказать, поэтому фиксируем момент, версию политики,
    # действовавшую на тот момент, и адрес, с которого оно дано.
    consent_accepted_at = models.DateTimeField(null=True, blank=True)
    consent_policy_version = models.CharField(max_length=20, blank=True)
    consent_ip = models.GenericIPAddressField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Профиль пользователя"
        verbose_name_plural = "Профили пользователей"

    # После аутентификации именно UserProfile становится request.user, хотя это
    # не django.contrib.auth.User — два свойства ниже нужны, чтобы DRF-пермишен
    # IsAuthenticated пропускал такие запросы.
    @property
    def is_authenticated(self) -> bool:
        """Всегда True: анонимные запросы до профиля не доходят."""
        return True

    @property
    def is_anonymous(self) -> bool:
        """Всегда False — зеркальная пара к is_authenticated."""
        return False

    @staticmethod
    def normalize_email(raw: str) -> str:
        """Привести email к каноничному виду: без пробелов, в нижнем регистре.

        Без этого Petrov@vuz.ru и petrov@vuz.ru стали бы разными аккаунтами и
        unique их не поймал бы.
        """
        return (raw or "").strip().lower()

    def set_password(self, raw_password: str) -> None:
        """Захэшировать пароль. Объект после этого нужно сохранить."""
        self.password = make_password(raw_password)

    def check_password(self, raw_password: str) -> bool:
        """Совпадает ли пароль с хранимым хэшем."""
        return check_password(raw_password, self.password)

    def __str__(self) -> str:
        return self.email


class RefreshToken(models.Model):
    """Долгоживущий токен обновления сессии — одна строка на устройство.

    Сам токен в базе НЕ хранится, только его sha256: утечка дампа не должна
    давать доступ к чужим сессиям. Токены одноразовые — `rotate` гасит
    предъявленный и выдаёт новый (см. users.tokens).
    """

    user = models.ForeignKey(
        UserProfile,
        on_delete=models.CASCADE,
        related_name="refresh_tokens",
    )
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    # Заполняется при выходе, ротации или принудительном отзыве всех сессий.
    revoked_at = models.DateTimeField(null=True, blank=True)

    # Чтобы пользователь мог опознать свои сессии, а мы — расследовать угон.
    user_agent = models.CharField(max_length=300, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        verbose_name = "Refresh-токен"
        verbose_name_plural = "Refresh-токены"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user} от {self.created_at:%d.%m.%Y %H:%M}"


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
