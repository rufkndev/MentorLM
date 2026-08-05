#!/usr/bin/env bash
#
# Деплой прода целиком. Запускается на сервере, из любой директории:
#
#     /srv/mentorlm/infra/deploy.sh
#
# Правило: на сервере код не редактируется — только git pull отсюда. Любая
# правка «по месту» разойдётся с репозиторием и сломает следующий деплой.

set -euo pipefail

# Корень репозитория — независимо от того, откуда вызвали скрипт.
cd "$(dirname "$0")/.."

# --env-file обязателен: он даёт подстановку ${...} в самом compose-файле, без
# которой фронт соберётся с пустыми NEXT_PUBLIC_*. Сам env_file для контейнеров
# на это не влияет.
COMPOSE="docker compose --env-file infra/env/.env -f infra/docker-compose.prod.yml"

echo "==> Обновляю код"
git pull --ff-only

echo "==> Пересобираю и поднимаю сервисы"
# Сборка идёт на работающем сайте; недоступность — только на пересоздании
# контейнеров (несколько секунд).
$COMPOSE up -d --build

echo "==> Проверяю прод-настройки"
$COMPOSE exec -T backend python manage.py check --deploy

echo "==> Убираю старые образы"
docker image prune -f

echo "==> Готово"
