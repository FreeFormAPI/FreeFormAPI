# FreeFormAPI

🚀 Open Source Form Backend for Static Sites

## Features
- ✅ Simple form submission via API
- ✅ Fastify server with TypeScript
- ✅ Self-hosted or Cloud
- ✅ Free & Open Source

## Quick Start
```bash
git clone https://github.com/FreeFormAPI/FreeFormAPI
cd FreeFormAPI/packages/backend
npm install
npm run dev
```

## API

# Проверка
```bash
curl http://localhost:3000/health
```
# Отправка формы
```bash
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{
    "formId": "contact",
    "email": "test@example.com",
    "message": "Привет!"
  }'
```
## ВОЗМОЖНОСТИ
Rate limiting (10 запросов/час)
Honeypot защита от спама
Валидация данных (Zod)
PostgreSQL + Redis
TypeScript + Docker

## DEPLOY
# На VPS:
```bash
git clone https://github.com/FreeFormAPI/FreeFormAPI.git
cd FreeFormAPI/docker
docker-compose -f docker-compose.prod.yml up -d
```
## Поддержка
GitHub Issues: https://github.com/FreeFormAPI/FreeFormAPI/issues
