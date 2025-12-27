/**
 * FreeFormAPI - Бэкенд для обработки форм с защитой от спама
 * Основной файл сервера на Fastify + TypeScript
 * 
 * @version 1.0.0
 * @author FreeFormAPI Team
 */

import Fastify from 'fastify';
import { Pool } from 'pg';
import { z } from 'zod';
import Redis from 'ioredis';
import dotenv from 'dotenv';

// Загружаем переменные окружения из .env файла
// Файл .env должен находиться в корне проекта packages/backend/
dotenv.config();

// ====================== КОНФИГУРАЦИЯ ПРИЛОЖЕНИЯ ======================
/**
 * Конфигурация приложения.
 * Все настройки берутся из переменных окружения с fallback значениями.
 */
const CONFIG = {
  DB: {
    HOST: process.env.DB_HOST || 'localhost',        // Хост PostgreSQL
    PORT: parseInt(process.env.DB_PORT || '5432'),   // Порт PostgreSQL
    NAME: process.env.DB_NAME || 'freeformapi',      // Имя базы данных
    USER: process.env.DB_USER || 'developer',        // Пользователь БД
    PASSWORD: process.env.DB_PASSWORD || 'password', // Пароль БД
  },
  REDIS: {
    HOST: process.env.REDIS_HOST || 'localhost',     // Хост Redis
    PORT: parseInt(process.env.REDIS_PORT || '6379'), // Порт Redis
    PASSWORD: process.env.REDIS_PASSWORD || 'password', // Пароль Redis
  },
  RATE_LIMIT: {
    WINDOW_MS: 60 * 60 * 1000,     // Временное окно: 1 час в миллисекундах
    MAX_REQUESTS: 10,              // Максимум 10 запросов в час с одного IP
    MESSAGE: 'Too many form submissions from your IP. Please try again later.' // Сообщение при превышении лимита
  },
  HONEYPOT_FIELD: '_honeypot'      // Название скрытого антиспам-поля (honeypot)
};

// ====================== ИНИЦИАЛИЗАЦИЯ БАЗ ДАННЫХ ======================

/**
 * Пул соединений с PostgreSQL.
 * Используется для выполнения SQL-запросов.
 * Настройки берутся из конфигурации приложения.
 */
const pool = new Pool({
  host: CONFIG.DB.HOST,
  port: CONFIG.DB.PORT,
  database: CONFIG.DB.NAME,
  user: CONFIG.DB.USER,
  password: CONFIG.DB.PASSWORD,
  max: 20,                         // Максимальное количество клиентов в пуле
  idleTimeoutMillis: 30000,        // Клиент будет закрыт после 30 секунд простоя
});

/**
 * Клиент Redis для rate limiting.
 * Используется для ограничения частоты запросов.
 */
const redis = new Redis({
  host: CONFIG.REDIS.HOST,
  port: CONFIG.REDIS.PORT,
  password: CONFIG.REDIS.PASSWORD,
  retryStrategy: (times) => {
    // Стратегия повторного подключения при сбоях
    const delay = Math.min(times * 50, 2000);
    console.log(`⚠️ Redis reconnect attempt ${times}, delay ${delay}ms`);
    return delay;
  },
  maxRetriesPerRequest: 3,         // Максимум 3 попытки повторного запроса
});

// Обработчики событий Redis
redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
  // НЕ завершаем процесс при ошибке Redis - работаем без rate limiting
});

redis.on('connect', () => {
  console.log('✅ Connected to Redis');
});

// ====================== СХЕМЫ ВАЛИДАЦИИ ДАННЫХ ======================
/**
 * Схема валидации для данных формы.
 * Использует Zod для строгой типизации и валидации.
 * 
 * @property {string} formId - Идентификатор формы (1-100 символов)
 * @property {string} email - Email адрес (валидный формат, до 255 символов)
 * @property {string} [message] - Опциональное сообщение (до 5000 символов)
 * @property {string} [_honeypot] - Honeypot поле для защиты от спама (должно быть пустым)
 */
const formSchema = z.object({
  formId: z.string().min(1).max(100),               // Обязательное поле, 1-100 символов
  email: z.email().max(255),                        // Валидный email, до 255 символов
  message: z.string().max(5000).optional(),         // Опциональное сообщение
  [CONFIG.HONEYPOT_FIELD]: z.string().max(0).optional() // Honeypot: должно быть пустой строкой или отсутствовать
});

// ====================== ИНИЦИАЛИЗАЦИЯ FASTIFY СЕРВЕРА ======================
/**
 * Создание экземпляра Fastify сервера.
 * Настраивается логирование через pino-pretty для читаемого вывода.
 */
const fastify = Fastify({
  logger: {
    level: 'info',                                   // Уровень логирования
    transport: {
      target: 'pino-pretty',                         // Используем pino-pretty для красивого вывода
      options: {
        colorize: true,                              // Цветной вывод
        translateTime: 'HH:MM:ss Z',                 // Формат времени
        ignore: 'pid,hostname'                       // Игнорируемые поля
      }
    }
  }
});

// ====================== MIDDLEWARE: ОГРАНИЧЕНИЕ ЧАСТОТЫ ЗАПРОСОВ ======================
/**
 * Middleware для ограничения частоты запросов (rate limiting).
 * Выполняется перед обработкой каждого запроса.
 * Применяется только к POST /api/submit.
 */
fastify.addHook('onRequest', async (request, reply) => {
  // Применяем rate limiting только к эндпоинту отправки форм
  if (request.url !== '/api/submit' || request.method !== 'POST') {
    return;
  }

  const clientIp = request.ip;                       // IP-адрес клиента
  const key = `rate_limit:${clientIp}`;              // Ключ для Redis (хранит счетчик запросов)

  try {
    // Используем MULTI для атомарности операций (инкремент + получение TTL)
    const multi = redis.multi();
    multi.incr(key);                                 // Увеличиваем счетчик запросов
    multi.ttl(key);                                  // Получаем время жизни ключа

    const results = await multi.exec();

    if (results && results[0] && results[1]) {
      const requestCount = results[0][1] as number;  // Текущее количество запросов
      const ttl = results[1][1] as number;           // Оставшееся время жизни ключа (TTL)

      // Если это первый запрос в окне - устанавливаем TTL на 1 час
      if (requestCount === 1 && ttl === -1) {
        await redis.expire(key, CONFIG.RATE_LIMIT.WINDOW_MS / 1000);
      }

      // Проверяем превышение лимита запросов
      if (requestCount > CONFIG.RATE_LIMIT.MAX_REQUESTS) {
        console.log(`🚫 Rate limit exceeded: ${clientIp} (${requestCount} requests)`);

        // Отправляем ответ 429 (Too Many Requests)
        reply.code(429).send({
          success: false,
          message: CONFIG.RATE_LIMIT.MESSAGE,
          retryAfter: `${Math.ceil(ttl / 60)} minutes`, // Время до сброса лимита в минутах
          limit: CONFIG.RATE_LIMIT.MAX_REQUESTS
        });

        throw new Error('RATE_LIMIT_EXCEEDED');      // Пробрасываем ошибку для остановки обработки
      }

      console.log(`📊 Rate: ${clientIp} = ${requestCount}/${CONFIG.RATE_LIMIT.MAX_REQUESTS}`);
    }
  } catch (error) {
    if (error.message === 'RATE_LIMIT_EXCEEDED') {
      throw error;                                   // Пробрасываем ошибку rate limiting дальше
    }
    // Если Redis недоступен - пропускаем rate limiting с предупреждением
    console.warn('⚠️ Redis unavailable, skipping rate limit');
  }
});

// ====================== ОСНОВНЫЕ ЭНДПОИНТЫ API ======================

/**
 * GET /health
 * Проверка состояния сервиса и его зависимостей.
 * Возвращает статус API, PostgreSQL и Redis.
 */
fastify.get('/health', async (request, reply) => {
  const checks: Record<string, string> = {
    api: 'OK',
    postgres: 'CHECKING',
    redis: 'CHECKING'
  };

  try {
    // Проверяем подключение к PostgreSQL (простой запрос)
    await pool.query('SELECT 1');
    checks.postgres = 'OK';
  } catch (error) {
    checks.postgres = 'ERROR';
    console.error('PostgreSQL health check failed:', error);
  }

  try {
    // Проверяем подключение к Redis (команда PING)
    await redis.ping();
    checks.redis = 'OK';
  } catch (error) {
    checks.redis = 'ERROR';
    console.error('Redis health check failed:', error);
  }

  const allOk = checks.postgres === 'OK';            // Сервис считается рабочим если PostgreSQL доступен

  return reply.code(allOk ? 200 : 503).send({
    status: allOk ? 'OK' : 'DEGRADED',
    service: 'FreeFormAPI',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks,                                          // Результаты проверок компонентов
    rateLimit: {
      enabled: checks.redis === 'OK',               // Rate limiting активен если Redis доступен
      maxRequests: CONFIG.RATE_LIMIT.MAX_REQUESTS,
      window: '1 hour'
    }
  });
});

/**
 * POST /api/submit
 * Основной эндпоинт для отправки данных формы.
 * Выполняет валидацию, проверку на спам и сохранение в БД.
 */
fastify.post('/api/submit', async (request, reply) => {
  try {
    // 1. ВАЛИДАЦИЯ ВХОДНЫХ ДАННЫХ
    const validation = formSchema.safeParse(request.body);

    if (!validation.success) {
      console.log('❌ Validation failed:', validation.error.issues);

      return reply.code(400).send({
        success: false,
        message: 'Validation failed',
        errors: validation.error.issues.map(issue => ({
          field: issue.path.join('.'),              // Путь к полю (например, 'email')
          message: issue.message,                   // Сообщение об ошибке
          code: issue.code                          // Код ошибки Zod
        }))
      });
    }

    const formData = validation.data;                // Валидированные данные формы
    const clientIp = request.ip;                     // IP-адрес клиента

    // 2. ПРОВЕРКА HONEYPOT (ЗАЩИТА ОТ СПАМА)
    if (formData[CONFIG.HONEYPOT_FIELD] && formData[CONFIG.HONEYPOT_FIELD] !== '') {
      console.log(`🤖 Spam detected (honeypot) from IP: ${clientIp}`);

      // Сохраняем попытку спама в БД с пометкой is_spam = true
      await pool.query(
        `INSERT INTO form_submissions 
         (form_id, email, message, ip_address, user_agent, is_spam, status) 
         VALUES ($1, $2, $3, $4, $5, true, 'blocked')`,
        [
          formData.formId,
          formData.email,
          formData.message || '[SPAM - honeypot triggered]',
          clientIp,
          request.headers['user-agent'] || ''
        ]
      );

      // Возвращаем успех, чтобы не показывать боту что мы его обнаружили
      return {
        success: true,
        message: 'Form received successfully!'
      };
    }

    // 3. СОХРАНЕНИЕ ДАННЫХ В POSTGRESQL
    const result = await pool.query(
      `INSERT INTO form_submissions 
       (form_id, email, message, ip_address, user_agent, status) 
       VALUES ($1, $2, $3, $4, $5, 'pending') 
       RETURNING id, created_at`,
      [
        formData.formId,
        formData.email,
        formData.message || null,                    // NULL если сообщение не указано
        clientIp,
        request.headers['user-agent'] || ''          // User-Agent браузера или пустая строка
      ]
    );

    const submission = result.rows[0];               // Сохраненная запись из БД

    console.log('📨 Form saved:', {
      id: submission.id,
      formId: formData.formId,
      email: formData.email,
      ip: clientIp
    });

    // 4. УСПЕШНЫЙ ОТВЕТ
    return {
      success: true,
      message: 'Form received and saved!',
      submissionId: submission.id,
      createdAt: submission.created_at,
      rateLimit: {
        remaining: await getRemainingRequests(clientIp), // Оставшееся количество запросов
        window: '1 hour'
      }
    };

  } catch (error) {
    console.error('Form submission error:', error);

    // Если это не ошибка rate limiting (она уже обработана в middleware)
    if (error.message !== 'RATE_LIMIT_EXCEEDED') {
      return reply.code(500).send({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined // Показываем детали только в разработке
      });
    }

    throw error; // Пробрасываем rate limit ошибку дальше (она будет обработана Fastify)
  }
});

/**
 * Вспомогательная функция для получения оставшегося количества запросов.
 * 
 * @param {string} ip - IP-адрес клиента
 * @returns {Promise<number>} - Количество оставшихся запросов в текущем окне
 */
async function getRemainingRequests(ip: string): Promise<number> {
  try {
    const key = `rate_limit:${ip}`;
    const current = await redis.get(key);
    return current 
      ? Math.max(0, CONFIG.RATE_LIMIT.MAX_REQUESTS - parseInt(current)) // Вычисляем остаток
      : CONFIG.RATE_LIMIT.MAX_REQUESTS;                                // Если ключа нет - полный лимит
  } catch {
    return CONFIG.RATE_LIMIT.MAX_REQUESTS; // Если Redis недоступен - возвращаем полный лимит
  }
}

/**
 * GET /
 * Корневой эндпоинт с информацией о сервисе.
 * Возвращает базовую информацию и статистику.
 */
fastify.get('/', async (request, reply) => {
  let dbStats = { submissions: 0, pending: 0 };

  try {
    // Получаем статистику из БД: общее количество отправок и ожидающих обработки
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as submissions,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending
      FROM form_submissions
    `);
    dbStats = statsResult.rows[0];
  } catch (error) {
    console.warn('Could not fetch DB stats:', error);
  }

  return {
    message: 'Welcome to FreeFormAPI!',
    version: '1.0.0',
    status: 'operational',
    endpoints: {
      health: 'GET /health',
      submit: 'POST /api/submit'
    },
    statistics: dbStats,
    rateLimit: {
      maxPerHour: CONFIG.RATE_LIMIT.MAX_REQUESTS,
      description: 'Per IP address'
    }
  };
});

// ====================== ЗАПУСК СЕРВЕРА ======================
/**
 * Функция запуска сервера.
 * Выполняет проверку подключений к БД и запускает HTTP-сервер.
 */
const start = async () => {
  try {
    // Проверяем подключение к PostgreSQL при старте
    await pool.connect();
    console.log('✅ Connected to PostgreSQL');

    // Проверяем Redis (но не блокируем запуск если он недоступен)
    try {
      await redis.ping();
      console.log('✅ Connected to Redis');
    } catch (error) {
      console.warn('⚠️ Redis not available, rate limiting disabled');
    }

    // Запускаем HTTP-сервер
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('🚀 FreeFormAPI server running on http://localhost:3000');
    console.log('✅ Health check: http://localhost:3000/health');
    console.log('📊 Database: PostgreSQL 18.1 (freeformapi)');

  } catch (err) {
    console.error('❌ Server startup error:', err);
    process.exit(1); // Завершаем процесс с ошибкой
  }
};

// Запускаем сервер
start();

// ====================== ОБРАБОТКА ГРАЦИОЗНОГО ЗАВЕРШЕНИЯ ======================
/**
 * Обработчик сигнала SIGTERM для грациозного завершения работы.
 * Закрывает все соединения перед завершением процесса.
 */
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');

  // Закрываем все соединения в правильном порядке
  await fastify.close();   // Останавливаем HTTP-сервер
  await pool.end();        // Закрываем пул соединений PostgreSQL
  await redis.quit();      // Закрываем соединение с Redis

  console.log('Server shut down');
  process.exit(0);         // Завершаем процесс успешно
});