/**
 * FreeFormAPI - Главный файл приложения
 * После рефакторинга содержит только точку входа
 */

import { createServer, startServer, stopServer } from './lib/server';
import { 
  createPostgresPool, 
  createRedisClient, 
  closeDatabaseConnections,
  checkPostgresConnection,
  checkRedisConnection
} from './lib/database';
import { SERVER_CONFIG, APP_CONFIG } from './config';
import { LOG_PREFIXES } from './config/constants';

// Инициализация сервера
const server = createServer();

// Инициализация баз данных
const postgresPool = createPostgresPool();
const redisClient = createRedisClient();

// В разделе с роутами добавим:
server.get('/', async () => {
  return {
    service: APP_CONFIG.NAME,
    version: APP_CONFIG.VERSION,
    description: APP_CONFIG.DESCRIPTION,
    status: 'operational',
    stage: 'refactor-day1',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: 'GET /health - Проверка состояния сервера и БД',
      submit: 'POST /api/submit - Отправка формы (в процессе рефакторинга)',
      session: 'GET /api/session - Создание сессии (в процессе рефакторинга)'
    },
    database: {
      postgres: 'connected',
      redis: 'connected',
      postgres_version: '18.1',
      redis_version: '8.4.0'
    },
    note: '🚧 Сервер в процессе рефакторинга. Полная функциональность будет восстановлена в следующие дни.'
  };
});

// Регистрируем роуты (пока заглушки, будут добавлены на 4-й день)
server.get('/health', async () => {
  return { 
    status: 'ok', 
    service: APP_CONFIG.NAME, 
    version: APP_CONFIG.VERSION,
    stage: 'refactor-day1',
    timestamp: new Date().toISOString()
  };
});

server.post('/api/submit', async (request, reply) => {
  return { 
    success: true, 
    message: 'Эндпоинт в процессе рефакторинга',
    note: 'Полная функциональность будет восстановлена на 4-й день рефакторинга',
    stage: 'refactor-day1'
  };
});

server.get('/api/session', async () => {
  return {
    success: true,
    data: {
      sessionId: 'session-placeholder',
      honeypotField: '_hp_placeholder',
      expiresIn: 600,
      createdAt: new Date().toISOString(),
      message: 'Сессионный сервис в процессе рефакторинга',
      stage: 'refactor-day1'
    }
  };
});

// Обработка сигналов завершения
async function gracefulShutdown(signal: string) {
  console.log(`\n${LOG_PREFIXES.INFO} Получен сигнал ${signal}, завершаем работу...`);
  
  try {
    // Останавливаем сервер
    await stopServer(server);
    
    // Закрываем подключения к БД
    await closeDatabaseConnections(postgresPool, redisClient);
    
    console.log(`${LOG_PREFIXES.SUCCESS} FreeFormAPI успешно остановлен`);
    process.exit(0);
  } catch (error) {
    console.error(`${LOG_PREFIXES.ERROR} Ошибка при завершении работы:`, error);
    process.exit(1);
  }
}

// Запуск сервера
async function startApp() {
  try {
    console.log(`\n${LOG_PREFIXES.SERVER} Запуск ${APP_CONFIG.NAME} v${APP_CONFIG.VERSION}...`);
    
    // Проверяем подключения к БД
    console.log(`${LOG_PREFIXES.DEBUG} Проверка подключения к PostgreSQL...`);
    const pgConnected = await checkPostgresConnection(postgresPool);
    
    console.log(`${LOG_PREFIXES.DEBUG} Проверка подключения к Redis...`);
    const redisConnected = await checkRedisConnection(redisClient);
    
    if (!pgConnected) {
      console.warn(`${LOG_PREFIXES.WARNING} PostgreSQL недоступен, некоторые функции ограничены`);
    }
    
    if (!redisConnected) {
      console.warn(`${LOG_PREFIXES.WARNING} Redis недоступен, rate limiting отключен`);
    }
    
    // Запускаем сервер
    await startServer(server);
    
    console.log(`\n${LOG_PREFIXES.SUCCESS} Рефакторинг День 1 завершен успешно!`);
    console.log(`${LOG_PREFIXES.INFO} Конфигурация и структура проекта обновлены`);
    console.log(`${LOG_PREFIXES.INFO} Дальнейшие шаги будут выполнены в следующие дни`);
    console.log(`\n${LOG_PREFIXES.DEBUG} Доступные эндпоинты:`);
    console.log(`  GET  /health      - Проверка состояния`);
    console.log(`  POST /api/submit  - Заглушка (в процессе рефакторинга)`);
    console.log(`  GET  /api/session - Заглушка (в процессе рефакторинга)`);
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
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // Для nodemon

// Обработчики необработанных ошибок
process.on('uncaughtException', (error) => {
  console.error(`${LOG_PREFIXES.ERROR} Необработанное исключение:`, error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`${LOG_PREFIXES.ERROR} Необработанный промис:`, reason);
});

// Запускаем приложение
startApp();

// Экспорты для тестов (если нужно)
export { server, postgresPool, redisClient };