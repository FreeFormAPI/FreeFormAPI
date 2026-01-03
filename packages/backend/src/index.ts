/**
 * FreeFormAPI - Главный файл приложения
 * После рефакторинга Дня 2
 */

import { createServer, startServer, stopServer } from './lib/server';
import { 
  createPostgresPool, 
  createRedisClient, 
  closeDatabaseConnections,
  checkPostgresConnection,
  checkRedisConnection
} from './lib/database';
import { SessionService } from './services/session.service';
import { DatabaseService } from './services/database.service';
import { FormService } from './services/form.service';
import { FormController } from './controllers/form.controller';
import { SessionController } from './controllers/session.controller';
import { createRateLimitMiddleware } from './middleware/rate-limit';
import { SERVER_CONFIG, APP_CONFIG } from './config';
import { LOG_PREFIXES } from './config/constants';

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

console.log(`\n${LOG_PREFIXES.SERVER} 🚀 Запуск ${APP_CONFIG.NAME} v${APP_CONFIG.VERSION}...`);

// 1. Инициализация сервера
const server = createServer();

// 2. Инициализация баз данных
console.log(`${LOG_PREFIXES.DATABASE} Создание пула подключений PostgreSQL...`);
const postgresPool = createPostgresPool();

console.log(`${LOG_PREFIXES.REDIS} Создание клиента Redis...`);
const redisClient = createRedisClient();

// 3. Инициализация сервисов
console.log(`${LOG_PREFIXES.INFO} Инициализация сервисов...`);
const sessionService = new SessionService(redisClient);
const databaseService = new DatabaseService(postgresPool);
const formService = new FormService(sessionService, databaseService);

// 4. Инициализация контроллеров
console.log(`${LOG_PREFIXES.INFO} Инициализация контроллеров...`);
const formController = new FormController(formService, sessionService, databaseService);
const sessionController = new SessionController(sessionService);

// 5. Инициализация middleware
console.log(`${LOG_PREFIXES.INFO} Инициализация middleware...`);
const rateLimitMiddleware = createRateLimitMiddleware(redisClient);

// ==================== РЕГИСТРАЦИЯ MIDDLEWARE ====================

// Регистрируем rate limiting для /api/submit
rateLimitMiddleware.register(server, '/api/submit');

// ==================== РЕГИСТРАЦИЯ ЭНДПОИНТОВ ====================

/**
 * GET / - Корневой эндпоинт с информацией о сервисе
 */
server.get('/', async () => {
  const [dbStats, sessionStats] = await Promise.all([
    databaseService.getStats(),
    sessionService.getStats()
  ]);

  return {
    service: APP_CONFIG.NAME,
    version: APP_CONFIG.VERSION,
    description: APP_CONFIG.DESCRIPTION,
    status: 'operational',
    stage: 'refactor-day2',
    timestamp: new Date().toISOString(),
    endpoints: {
      root: 'GET / - Эта страница',
      health: 'GET /health - Проверка состояния',
      submit: 'POST /api/submit - Отправка формы',
      session: 'GET /api/session - Создание сессии',
      sessionValidate: 'GET /api/session/:id/validate - Проверка сессии'
    },
    database: {
      postgres: 'connected',
      redis: 'connected',
      submissions: dbStats.total,
      activeSessions: sessionStats.activeSessions
    },
    security: {
      honeypot: 'enabled',
      rateLimiting: 'enabled',
      sessions: 'enabled'
    },
    note: '✅ Рефакторинг День 2: Сессии и базы данных восстановлены'
  };
});

/**
 * GET /health - Проверка состояния сервиса
 */
server.get('/health', async () => {
  const [pgConnected, redisConnected, dbStats] = await Promise.all([
    checkPostgresConnection(postgresPool),
    checkRedisConnection(redisClient),
    databaseService.getStats()
  ]);

  const checks: Record<string, string> = {
    api: 'OK',
    postgres: pgConnected ? 'OK' : 'ERROR',
    redis: redisConnected ? 'OK' : 'ERROR',
    rate_limit: redisConnected ? 'ENABLED' : 'DISABLED'
  };

  const allOk = checks.postgres === 'OK';

  return {
    status: allOk ? 'OK' : 'DEGRADED',
    service: APP_CONFIG.NAME,
    version: APP_CONFIG.VERSION,
    stage: 'refactor-day2',
    timestamp: new Date().toISOString(),
    checks,
    statistics: {
      submissions: dbStats.total,
      pending: dbStats.pending,
      spam: dbStats.spamCount,
      last24h: dbStats.last24Hours
    },
    rateLimit: {
      enabled: checks.redis === 'OK',
      maxRequests: 100,
      window: '1 час'
    }
  };
});

/**
 * POST /api/submit - Отправка формы (полная функциональность)
 */
server.post('/api/submit', async (request, reply) => {
  return formController.submit(request, reply);
});

/**
 * GET /api/session - Создание новой сессии
 */
server.get('/api/session', async (request, reply) => {
  return sessionController.create(request, reply);
});

/**
 * GET /api/session/:sessionId/validate - Проверка сессии
 */
server.get('/api/session/:sessionId/validate', async (request, reply) => {
  return sessionController.validate(request, reply);
});

/**
 * GET /api/session/:sessionId - Получение информации о сессии
 */
server.get('/api/session/:sessionId', async (request, reply) => {
  return sessionController.get(request, reply);
});

/**
 * DELETE /api/session/:sessionId - Удаление сессии
 */
server.delete('/api/session/:sessionId', async (request, reply) => {
  return sessionController.delete(request, reply);
});

/**
 * GET /api/stats - Статистика (для отладки)
 */
server.get('/api/stats', async (request, reply) => {
  return formController.getStats(request, reply);
});

// ==================== ЗАПУСК СЕРВЕРА ====================

// Обработка сигналов завершения
async function gracefulShutdown(signal: string) {
  console.log(`\n${LOG_PREFIXES.INFO} Получен сигнал ${signal}, завершаем работу...`);
  
  try {
    // Останавливаем сервер
    await stopServer(server);
    
    // Закрываем подключения к БД
    await closeDatabaseConnections(postgresPool, redisClient);
    
    console.log(`${LOG_PREFIXES.SUCCESS} ${APP_CONFIG.NAME} успешно остановлен`);
    process.exit(0);
  } catch (error) {
    console.error(`${LOG_PREFIXES.ERROR} Ошибка при завершении работы:`, error);
    process.exit(1);
  }
}

// Запуск сервера
async function startApp() {
  try {
    console.log(`\n${LOG_PREFIXES.DEBUG} Проверка подключений к базам данных...`);
    
    // Проверяем подключения к БД
    const pgConnected = await checkPostgresConnection(postgresPool);
    const redisConnected = await checkRedisConnection(redisClient);
    
    // Создаем таблицу если её нет
    if (pgConnected) {
      await databaseService.createTableIfNotExists();
    }
    
    // Запускаем сервер
    await startServer(server);
    
    console.log(`\n${LOG_PREFIXES.SUCCESS} Рефакторинг День 2 завершен успешно!`);
    console.log(`${LOG_PREFIXES.INFO} Все функции восстановлены:`);
    console.log(`  ✅ Отправка форм с валидацией`);
    console.log(`  ✅ Honeypot защита от спама`);
    console.log(`  ✅ Сессионная система`);
    console.log(`  ✅ Rate limiting`);
    console.log(`  ✅ Сохранение в PostgreSQL`);
    console.log(`  ✅ Кэширование в Redis`);
    
    console.log(`\n${LOG_PREFIXES.DEBUG} Доступные эндпоинты:`);
    console.log(`  GET  /                         - Информация о сервисе`);
    console.log(`  GET  /health                   - Проверка состояния`);
    console.log(`  POST /api/submit               - Отправка формы`);
    console.log(`  GET  /api/session              - Создание сессии`);
    console.log(`  GET  /api/session/:id/validate - Проверка сессии`);
    console.log(`  GET  /api/session/:id          - Информация о сессии`);
    console.log(`  DELETE /api/session/:id        - Удаление сессии`);
    console.log(`  GET  /api/stats                - Статистика`);
    
    console.log(`\n${LOG_PREFIXES.INFO} Базы данных:`);
    console.log(`  PostgreSQL: ${pgConnected ? '✅' : '❌'}`);
    console.log(`  Redis: ${redisConnected ? '✅' : '❌'}`);
    
  } catch (error) {
    console.error(`${LOG_PREFIXES.ERROR} Критическая ошибка при запуске:`, error);
    process.exit(1);
  }
}

// Обработчики сигналов
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2'));

// Обработчики необработанных ошибок
process.on('uncaughtException', (error) => {
  console.error(`${LOG_PREFIXES.ERROR} Необработанное исключение:`, error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`${LOG_PREFIXES.ERROR} Необработанный промис:`, reason);
});

// Запускаем приложение
startApp();

// Экспорты для тестов
export { 
  server, 
  postgresPool, 
  redisClient,
  sessionService,
  databaseService,
  formService,
  formController,
  sessionController
};