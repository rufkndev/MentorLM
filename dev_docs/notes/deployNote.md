# Методичка: разработка и деплой

## 1. Локальная разработка

### Первый запуск (один раз)

```bash
# 0. база и кэш в докере
docker compose -f infra/docker-compose.dev.yml up -d db redis

# 1. env-файл: infra/env/.env (образец — .env.example).
#    Он один на весь проект: NEXT_PUBLIC_* фронт подтягивает оттуда же
#    (это делает next.config.ts), отдельный .env.local заводить не нужно.

# 2. бэкенд
cd backend/mentorlm
python3 -m venv .venv && source .venv/bin/activate
pip install -r ../requirements.txt
python manage.py migrate
python manage.py createsuperuser        # это аккаунт ДЛЯ /admin/, а не для приложения

# 3. фронт
cd frontend/mentorlm && pnpm install
```



### Обычный цикл: три терминала

```bash
# 0. база и Redis — поднимаются один раз и живут фоном
docker compose -f infra/docker-compose.dev.yml up -d db redis

# 1. бэкенд
cd backend/mentorlm && source .venv/bin/activate
python manage.py runserver          # settings.dev подставляется сам, флагов не нужно

# 2. фронт
cd frontend/mentorlm && pnpm dev     # http://localhost:3000
```



### Вариант «всё в контейнерах»

Нужен редко — когда проверяешь саму сборку, а не код:

```bash
docker compose -f infra/docker-compose.dev.yml up -d --build   # db + redis + backend
docker compose -f infra/docker-compose.dev.yml logs -f backend
docker compose -f infra/docker-compose.dev.yml down            # данных не теряет
```

> ⚠️ `down -v` удаляет том с данными. В деве это иногда и нужно (начать с чистой  
> базы), на проде — никогда.

---



## 2. Прод: порядок действий

Порядок важен: каждый следующий шаг опирается на предыдущий. Самая частая
ошибка — лезть за TLS-сертификатом до того, как домен реально указывает на
сервер.


| #   | Шаг                                                               | Почему именно здесь                                                          |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 0   | [Домен → A-записи](#шаг-0--домен)                                 | DNS расходится по миру не мгновенно; запускаем первым, пока делаем остальное |
| 1   | [Подготовка сервера](#шаг-1--подготовка-сервера)                  | apt, время, swap, firewall, Docker                                           |
| 2   | [Код и env](#шаг-2--код-и-env)                                    | без заполненного env бэкенд не стартует                                      |
| 3   | [CA для админки](#шаг-3--ca-для-админки)                          | **без него nginx не запустится вообще**                                      |
| 4   | [Подъём без nginx](#шаг-4--подъём-без-nginx)                      | порт 80 нужен свободным для certbot                                          |
| 5   | [TLS-сертификат](#шаг-5--tls-сертификат)                          | требует рабочего DNS из шага 0                                               |
| 6   | [Полный стек](#шаг-6--полный-стек)                                | nginx стартует только когда есть и CA, и TLS                                 |
| 7   | [Суперпользователь и пропуск в админку](#шаг-7--доступ-в-админку) | /admin/ закрыт клиентским сертификатом                                       |
| 8   | [Бэкапы](#бэкапы)                                                 | обязательны по п.7 ч.2 ст.19 152-ФЗ                                          |


Дальше каталог проекта — `/srv/mentorlm`. Если у тебя он называется иначе
(например `/srv/MentorLM`), подставляй своё имя **везде**: Linux различает
регистр, и команда с чужим путём молча создаст новый пустой каталог вместо
ошибки.

---



## Шаг 1 — подготовка сервера



### Обновление системы и базовые пакеты

```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl gnupg git nano dnsutils
```

Часовой пояс — чтобы логи и cron совпадали с реальностью:

```bash
timedatectl set-timezone Europe/Moscow
```



### Docker

Ставим из официального репозитория. Пакет `docker.io` из репозиториев Ubuntu
даёт только движок — подкоманды `docker compose` в нём нет.

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Проверка:

```bash
docker compose version     # должно быть v2.x
docker run --rm hello-world
```

Если `apt update` выдал 404 на `download.docker.com` (бывает на свежих релизах
Ubuntu, которых ещё нет в репозитории Docker) — запасной вариант, обязательно с
плагином compose:

```bash
apt install -y docker.io docker-compose-v2
```

---



## Шаг 2 — код и env

```bash
mkdir -p /srv/mentorlm
git clone <репозиторий> /srv/mentorlm
cd /srv/mentorlm
chmod +x infra/deploy.sh          # если флаг не приехал из git
```

Env-файл:

```bash
cp infra/env/.env.example infra/env/.env
chmod 600 infra/env/.env
nano infra/env/.env
```

`chmod 600` — сразу: в файле пароль базы, ключи OpenAI и Anthropic, прокси с
логином и паролем. После `cp` права наследуются от образца (644, читаемо всем).

### Что заполнить

Случайный ключ Django генерируем так:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

Именно `token_urlsafe`: он выдаёт только `A-Za-z0-9_-`. Значение проходит через
два парсера со своими спецсимволами — `python-dotenv` обрежет всё после `#`, а
docker compose попытается раскрыть `$VAR`. В этом алфавите таких символов нет.

Прод-значения:

```
NEXT_PUBLIC_APP_URL=https://mentorlm.ru
NEXT_PUBLIC_API_URL=https://mentorlm.ru
DJANGO_SECRET_KEY=<вывод команды выше>
ALLOWED_HOSTS=mentorlm.ru,www.mentorlm.ru
CSRF_TRUSTED_ORIGINS=https://mentorlm.ru,https://www.mentorlm.ru
CORS_ALLOWED_ORIGINS=
POSTGRES_DB=mentorlm
POSTGRES_USER=mentorlm
POSTGRES_PASSWORD=<длинный случайный пароль>
LLM_PROXY_URL=socks5://user:pass@host:port
OPENAI_API_KEY=<ключ>
ANTHROPIC_API_KEY=<ключ>
```

`POSTGRES_HOST`, `POSTGRES_PORT` и `REDIS_URL` в проде перекрываются самим  
compose-файлом — править их не нужно.

Пять переменных обязательны: `DJANGO_SECRET_KEY`, `ALLOWED_HOSTS`,
`CSRF_TRUSTED_ORIGINS`, `REDIS_URL`, `POSTGRES_PASSWORD`. `settings/prod.py`
намеренно роняет процесс на старте, если любая из них пуста — поднять прод на
дев-значениях нельзя. Оставшийся из образца `change-me-...` проверку **пройдёт**:
она ловит только пустоту.

---



## Шаг 3 — CA для админки

Это «печать», которой подписываются пропуска в `/admin/`. Сам доступ она не
даёт — пропуска выпускаются в шаге 7.

⚠️ **Без файла** `admin-ca.crt` **nginx не стартует**: он указан в
`ssl_client_certificate`.

```bash
mkdir -p /srv/mentorlm/infra/nginx/certs
cd /srv/mentorlm/infra/nginx/certs
openssl genrsa -out admin-ca.key 4096
openssl req -x509 -new -nodes -key admin-ca.key -sha256 -days 3650 \
  -subj "/CN=MentorLM Admin CA" -out admin-ca.crt
chmod 600 admin-ca.key
ls -l
```

Каталог `infra/nginx/certs/` целиком в `.gitignore` — файлы живут только на
сервере, `git pull` их не трогает. Обратная сторона: они нигде не бэкапятся.
Скопируй `admin-ca.key` и `admin-ca.crt` в менеджер паролей — иначе при потере
сервера все выданные пропуска придётся перевыпускать.

---



## Шаг 4 — подъём без nginx

Порт 80 должен остаться свободным: его займёт certbot на следующем шаге.

```bash
cd /srv/mentorlm/infra
docker compose --env-file env/.env -f docker-compose.prod.yml up -d db redis backend frontend
```

Проверка:

```bash
docker compose --env-file env/.env -f docker-compose.prod.yml ps
```

Все четыре контейнера должны быть `Up`, `backend` и `db` — ещё и `(healthy)`.

Если `backend` крутится в цикле перезапусков, смотри причину:

```bash
docker compose --env-file env/.env -f docker-compose.prod.yml logs --tail=50 backend
```

Контейнер на старте выполняет `migrate` → `collectstatic` → `gunicorn`; падение
на любом шаге убивает процесс, а `restart: always` запускает его заново. Разбор
частых причин — в [диагностике](#5-диагностика-частые-грабли).

---



## Шаг 5 — TLS-сертификат

Требования: DNS из шага 0 уже отдаёт IP сервера, порт 80 свободен и доступен  
снаружи, nginx **не** запущен.

Сначала пробный выпуск. У Let's Encrypt лимит 5 неудачных проверок на домен в
час — отлаживать DNS боевыми запросами нельзя:

```bash
docker run --rm -p 80:80 \
  -v mentorlm_letsencrypt:/etc/letsencrypt -v mentorlm_certbot-www:/var/www/certbot \
  certbot/certbot certonly --standalone --dry-run \
  -d mentorlm.ru -d www.mentorlm.ru \
  --email artaran2005@gmail.com --agree-tos --no-eff-email
```

Увидел `The dry run was successful` — повторяй ту же команду **без** `--dry-run`.

Сертификаты лягут в docker-том `mentorlm_letsencrypt`, а не в папку проекта —  
так и задумано: приватный ключ не попадает в рабочее дерево git, том переживает  
пересборку контейнеров, и его читают сразу два сервиса (certbot пишет, nginx  
читает). Префикс `mentorlm_` берётся из `name: mentorlm` в compose-файле и от  
имени каталога не зависит.

---



## Шаг 6 — полный стек

```bash
cd /srv/mentorlm
./infra/deploy.sh
```

Скрипт делает `git pull --ff-only` → пересборку → `up -d` → `check --deploy` →
чистку старых образов.

Если `Permission denied` — не приехал флаг исполняемости:

```bash
chmod +x infra/deploy.sh      # либо разово: bash infra/deploy.sh
```

---



## Шаг 7 — доступ в админку



### Суперпользователь Django

```bash
cd /srv/mentorlm
docker compose --env-file infra/env/.env -f infra/docker-compose.prod.yml \
  exec backend python manage.py createsuperuser
```



### Пропуск для устройства (mTLS)

`/admin/` закрыт привязкой к устройству, а не к IP: домашний IP динамический, из
поездки или с телефона по IP не зайти вовсе, а сертификат едет с ноутбуком.
nginx отдаёт `403`, пока браузер не предъявит пропуск.

**Не путай два файла.** `admin-ca.`* из шага 3 — печать, лежит на сервере и
доступ сама не даёт. `<устройство>.p12` — пропуск, подписанный этой печатью;
его надо выпустить отдельно и установить на устройство.

**На сервере** — весь блок целиком:

```bash
cd /srv/mentorlm/infra/nginx/certs
DEV=macbook                       # понятное имя устройства

openssl genrsa -out $DEV.key 2048
openssl req -new -key $DEV.key -subj "/CN=$DEV" -out $DEV.csr
openssl x509 -req -in $DEV.csr -CA admin-ca.crt -CAkey admin-ca.key \
  -CAcreateserial -days 825 -sha256 -out $DEV.crt
openssl pkcs12 -export -inkey $DEV.key -in $DEV.crt -certfile admin-ca.crt -out $DEV.p12
rm $DEV.csr
ls -l $DEV.p12
```

`openssl pkcs12` спросит `Enter Export Password` и повтор — придумай пароль и
запомни, он понадобится один раз при импорте. Символы при вводе не
отображаются. Последняя строка обязательна: если `.p12` не создался, пароли не
совпали — повторяй блок, дальше не иди.

**На локальной машине** — сначала забрать, только потом удалять с сервера:

```bash
scp root@<IP>:/srv/mentorlm/infra/nginx/certs/macbook.p12 ~/Downloads/
ls -l ~/Downloads/macbook.p12
ssh root@<IP> 'cd /srv/mentorlm/infra/nginx/certs && rm macbook.p12 macbook.key'
```

На сервере остаётся только `macbook.crt` — это публичная часть, она безвредна.

**Установка, macOS:** двойной клик по `~/Downloads/macbook.p12` → импорт в связку  
**«Вход»** → пароль от `.p12`. Safari и Chrome подхватят сами. Firefox использует  
своё хранилище: Настройки → Приватность → Сертификаты → Просмотр сертификатов →  
«Ваши сертификаты» → Импортировать.

---



## 3. Ежедневные команды

Все команды ниже — из корня проекта (`cd /srv/mentorlm`).

### Деплой после обновлений

```bash
./infra/deploy.sh
```



### Наблюдение

```bash
# статус всех сервисов
docker compose --env-file infra/env/.env -f infra/docker-compose.prod.yml ps

# логи одного сервиса, следить в реальном времени (Ctrl+C — выход, контейнер работает)
docker compose --env-file infra/env/.env -f infra/docker-compose.prod.yml logs -f backend

# последние 100 строк без слежения
docker compose --env-file infra/env/.env -f infra/docker-compose.prod.yml logs --tail=100 backend

# место на диске (тома, образы, кэш сборки)
docker system df
df -h
```



### Управление сервисами

```bash
# применить правки infra/env/.env — ТОЛЬКО так
docker compose --env-file infra/env/.env -f infra/docker-compose.prod.yml up -d backend

# перечитать конфиг nginx без простоя
docker compose --env-file infra/env/.env -f infra/docker-compose.prod.yml exec nginx nginx -s reload

# остановить всё (данные в томах остаются)
docker compose --env-file infra/env/.env -f infra/docker-compose.prod.yml down

# поднять всё обратно
docker compose --env-file infra/env/.env -f infra/docker-compose.prod.yml up -d

docker restart mentorlm-nginx
```

⚠️ После правки env-файла `restart` **не помогает**: он перезапускает тот же
контейнер со старым окружением. Нужен `up -d` — compose увидит, что содержимое
env-файла изменилось, и пересоздаст контейнер.

⚠️ `docker compose down -v` на проде не запускать никогда: флаг `-v` сносит том  
с базой.