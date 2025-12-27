# FreeFormAPI

Бесплатный бэкенд для форм со встроенной защитой от спама

## Возможности
- Отправка форм через API
- Защита от спама (rate limiting + honeypot)
- Fastify сервер на TypeScript
- Self-hosted или облачный хостинг
- PostgreSQL + Redis
- Docker для простого деплоя

## Быстрый старт
```bash
git clone https://github.com/FreeFormAPI/FreeFormAPI
cd FreeFormAPI/packages/backend
npm install
npm run dev
```

## API
### Проверка сервера
```bash
curl http://localhost:3000/health
```
### Отправка формы
```bash
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "formId": "contact",
    "email": "test@example.com",
    "message": "Привет!"
  }'
```

## Деплой на VPS
```bash
git clone https://github.com/FreeFormAPI/FreeFormAPI.git
cd FreeFormAPI/docker
docker-compose -f docker-compose.prod.yml up -d
```
## Поддержка
GitHub Issues: https://github.com/FreeFormAPI/FreeFormAPI/issues

Сайт: freeformapi.ru (скоро)
