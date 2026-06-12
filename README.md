# Mello — Kanban Task Management

Полнофункциональная система управления задачами с Kanban-досками.

## Стек

- **Frontend**: React + TypeScript + Tailwind CSS + @dnd-kit + Zustand → GitHub Pages
- **Backend**: Node.js + Express + TypeScript → Yandex Cloud Container Registry
- **Database**: PostgreSQL (Yandex Cloud Managed PostgreSQL)

## Функциональность

- ✅ Kanban-доски с drag-and-drop
- ✅ Создание/переименование столбцов
- ✅ Задачи: теги, дедлайн, оценка времени, приоритет (5 уровней), назначение исполнителей
- ✅ Перенос задач между столбцами
- ✅ Комментарии к задачам и история изменений
- ✅ Компании с кодом приглашения
- ✅ Проекты с разграничением доступа (admin/manager/member/viewer)
- ✅ Гибкие права: какие роли могут редактировать поля задач
- ✅ Регистрация и создание пользователей администратором

## Быстрый старт

### Backend

```bash
cd backend
cp .env.example .env
# Заполните DATABASE_URL, JWT_SECRET, CORS_ORIGIN
npm install
npm run migrate    # Создать таблицы
npm run dev        # Разработка
npm run build && npm start  # Продакшн
```

### Frontend

```bash
cd frontend
# Создайте .env.local:
echo "VITE_API_URL=http://localhost:3001/api" > .env.local
npm install
npm run dev        # Разработка на http://localhost:5173/Mello/
```

## Деплой на Yandex Cloud

1. **Managed PostgreSQL** — создайте кластер, получите строку подключения
2. **Container Registry** — соберите и загрузите Docker-образ бэкенда:
   ```bash
   cd backend
   docker build -t cr.yandex/<registry-id>/mello-backend:latest .
   docker push cr.yandex/<registry-id>/mello-backend:latest
   ```
3. **Serverless Container** или **Compute VM** — задеплойте образ с переменными окружения
4. **GitHub Pages** — добавьте секрет `VITE_API_URL` с адресом бэкенда, push в main → деплой автоматически

## Переменные окружения бэкенда

| Переменная | Описание |
|-----------|----------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Секретный ключ для JWT (32+ символа) |
| `JWT_EXPIRES_IN` | Срок действия токена (по умолчанию `7d`) |
| `CORS_ORIGIN` | URL фронтенда (например, `https://user.github.io`) |
| `PORT` | Порт (по умолчанию `3001`) |

## Роли

| Роль | Создание задач | Редактирование | Управление столбцами | Управление проектом |
|------|---------------|----------------|---------------------|---------------------|
| Admin | ✅ | ✅ | ✅ | ✅ |
| Manager | ✅ | ✅ | ✅ | ❌ |
| Member | ✅ | ✅ | ❌ | ❌ |
| Viewer | ❌ | ❌ | ❌ | ❌ |

Администратор проекта может дополнительно ограничить редактирование отдельных полей для каждой роли.
