# Шпаргалка по работе с Docker 

### Команды docker compose

1. Запуск
```bash
docker compose -f infra/docker-compose.dev.yml up -d # поиск нужного yaml и запуск контейнеров
docker compose -f infra/docker-compose.dev.yml up -d --build # пересборка перед запуском
```

2. Остановка
```bash
docker compose -f infra/docker-compose.dev.yml down # остановка всех контейнеров
docker compose -f infra/docker-compose.dev.yml down -v # очистка volumes
```

3. Перезапуск
```bash
docker compose -f infra/docker-compose.dev.yml restart
```

4. Статус контейнеров
```bash
docker ps # Просмотреть статусы контейнеров
```

5. Просмотр логов 
```bash
docker compose -f infra/docker-compose.dev.yml logs # просмотреть логи запущенных контейнеров
```