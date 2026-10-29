# Шпаргалка по Git

### Ежедневный цикл

1. Просмотреть изменения:

```bash
git status  # выполнять git status стоит часто – перед add, перед commit
git diff    # что поменялось (до add) - просмотр индекса
```

2. Добавить в staging area:

```bash
git add .
```

3. Коммит:

```bash
git commit -m "msg"
```

4. Отправить на Гитхаб:

```bash
git push
```

### Работа с ветками:

1. Создать и удалить ветку:

```bash
git branch branch-name                # создать ветку с именем "branch-name"
git branch -d branch-name             # удалить ветку с именем "old-branch"(локально)
git push --delete origin branch-name  # удаление ветки и на гитхабе
```

2. Переключение между ветками:

```bash
git switch branch-name          # переключится на ветку с именем "branch-name"

git checkout -b branch-name     # тоже создание и переключение на новую ветку
```

3. Пуш изменений в новую ветку:
```bash
git add .
git commit -m ""
git push --set-upstream origin branch-name # создает ветку в гитхабе (при первом пуше)
```

4. Слияние веток

```bash
git switch main         # переключение на основную ветку
git checkout main       # тоже переключение на основную ветку
git merge branch-name   # вливание изменений из ветки "branch-name" в основную ветку "main"
git push                # запушить обновленную мерджем основную ветку на гитхаб
```