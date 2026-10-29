# Работа с приложением на стадии development

## 1) Frontend (Next.js)

```bash
cd "frontend/mentorlm"
npm install
npm run dev

pnpm install
pnpm dev
```

- Обычно поднимается на `http://localhost:3000`.

## 2) Backend (Django)

```bash
cd "backend/mentorlm"
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r ../requirements.txt
python manage.py check
python manage.py migrate
python manage.py makemigrations # при изменении models.py
python manage.py createsuperuser # один раз
python manage.py runserver
```

- Обычно поднимается на `http://127.0.0.1:8000`.
- Деактивация venv: `deactivate`.

