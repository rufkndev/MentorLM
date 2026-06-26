from django.db import models


class UserProfile(models.Model):
    """Локальное отражение пользователя Clerk.

    Источник правды об авторизации — Clerk; в своей БД мы храним запись,
    привязанную к Clerk по `clerk_id`, и доменные поля приложения.
    """

    class Plan(models.TextChoices):
        FREE = "free", "Бесплатный"
        PRO = "pro", "Pro"

    clerk_id = models.CharField(max_length=255, unique=True, db_index=True)
    email = models.EmailField(blank=True)
    plan = models.CharField(max_length=20, choices=Plan.choices, default=Plan.FREE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Профиль пользователя"
        verbose_name_plural = "Профили пользователей"
        indexes = [
            models.Index(fields=["plan"]),
        ]

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

    class ResponseLength(models.TextChoices):
        SHORT = "short", "Короткие"
        BALANCED = "balanced", "Средние"
        DETAILED = "detailed", "Подробные"

    user = models.OneToOneField(
        UserProfile,
        on_delete=models.CASCADE,
        related_name="settings",
    )

    # — Внешний вид и поведение интерфейса —
    theme = models.CharField(
        max_length=20, choices=Theme.choices, default=Theme.SYSTEM
    )
    interface_lang = models.CharField(max_length=10, default="ru")
    font_size = models.CharField(
        max_length=10, choices=FontSize.choices, default=FontSize.MD
    )
    show_suggestions = models.BooleanField(default=True)
    auto_scroll = models.BooleanField(default=True)

    # — Параметры модели ИИ (применяются к AI-вызовам, когда появится AI-слой) —
    default_model = models.CharField(max_length=50, blank=True)
    temperature = models.FloatField(default=0.7)
    response_length = models.CharField(
        max_length=20,
        choices=ResponseLength.choices,
        default=ResponseLength.BALANCED,
    )
    context_size = models.CharField(max_length=10, default="20")
    streaming = models.BooleanField(default=True)
    web_search = models.BooleanField(default=False)

    # — Память и персональные инструкции (≈ Claude «Personal preferences») —
    nickname = models.CharField(max_length=100, blank=True)
    occupation = models.CharField(max_length=150, blank=True)
    custom_about = models.TextField(blank=True)
    custom_style = models.TextField(blank=True)
    auto_memory = models.BooleanField(default=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Настройки пользователя"
        verbose_name_plural = "Настройки пользователей"

    def __str__(self) -> str:
        return f"Настройки {self.user}"
