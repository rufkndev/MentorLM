"""Переход с внешней аутентификации (Clerk) на свою: логин по email и паролю.

⚠️ Миграция рассчитана на ПУСТУЮ таблицу users_userprofile и написана руками
именно поэтому: `email` становится unique, а `password` — NOT NULL без
осмысленного значения по умолчанию. На заполненной базе это упало бы (или,
хуже, завело всем пустой пароль). Переносить учётки было неоткуда: паролей
Clerk у нас нет и никогда не было, пользователи регистрируются заново.
"""

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0009_alter_usersettings_chat_retention_days"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="userprofile",
            name="clerk_id",
        ),
        migrations.AlterField(
            model_name="userprofile",
            name="email",
            field=models.EmailField(db_index=True, max_length=254, unique=True),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="password",
            field=models.CharField(default="", max_length=128),
            # Пустая строка — не валидный хэш, и check_password с ней всегда
            # False: даже если строки каким-то образом окажутся, войти по ним
            # нельзя. В модели дефолта нет.
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="userprofile",
            name="is_active",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="email_verified",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="last_login_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="consent_accepted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="consent_policy_version",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="consent_ip",
            field=models.GenericIPAddressField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="RefreshToken",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("token_hash", models.CharField(db_index=True, max_length=64, unique=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField()),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                ("user_agent", models.CharField(blank=True, max_length=300)),
                ("ip", models.GenericIPAddressField(blank=True, null=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="refresh_tokens",
                        to="users.userprofile",
                    ),
                ),
            ],
            options={
                "verbose_name": "Refresh-токен",
                "verbose_name_plural": "Refresh-токены",
                "ordering": ["-created_at"],
            },
        ),
    ]
