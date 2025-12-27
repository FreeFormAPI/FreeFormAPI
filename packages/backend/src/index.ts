import Fastify from 'fastify';
import { Pool } from 'pg';
import { z } from 'zod';
import Redis from 'ioredis';
import dotenv from 'dotenv';

// Загружаем .env файл
dotenv.config();

// ====================== КОНФИГУРАЦИЯ ======================
const CONFIG = {
  DB: {
    HOST: process.env.DB_HOST || 'localhost',
    PORT: parseInt(process.env.DB_PORT || '5432'),
    NAME: process.env.DB_NAME || 'freeformapi',
    USER: process.env.DB_USER || 'developer',
    PASSWORD: process.env.DB_PASSWORD || 'password', // из .env
  },
  REDIS: {
    HOST: process.env.REDIS_HOST || 'localhost',
    PORT: parseInt(process.env.REDIS_PORT || '6379'),
    PASSWORD: process.env.REDIS_PASSWORD || 'password', // из .env
  },
  RATE_LIMIT: {
    WINDOW_MS: 60 * 60 * 1000, // 1 час в миллисекундах
    MAX_REQUESTS: 10, // максимум 10 запросов в час с IP
    MESSAGE: 'Too many form submissions from your IP. Please try again later.'
  },
  HONEYPOT_FIELD: '_honeypot' // название скрытого антиспам-поля
};

// ====================== ПОДКЛЮЧЕНИЯ ======================

// PostgreSQL
const pool = new Pool({
  host: CONFIG.DB.HOST,
  port: CONFIG.DB.PORT,
  database: CONFIG.DB.NAME,
  user: CONFIG.DB.USER,
  password: CONFIG.DB.PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
});

// Redis для rate limiting
const redis = new Redis({
  host: CONFIG.REDIS.HOST,
  port: CONFIG.REDIS.PORT,
  password: CONFIG.REDIS.PASSWORD,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    console.log(`⚠️ Redis reconnect attempt ${times}, delay ${delay}ms`);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

// Обработка ошибок Redis
redis.on('error', (err) => {
  console.error('❌ Redis connection error:', err.message);
  // НЕ завершаем процесс - работаем без rate limiting при падении Redis
});

redis.on('connect', () => {
  console.log('✅ Connected to Redis');
});

// ====================== СХЕМЫ ВАЛИДАЦИИ ======================
const formSchema = z.object({
  formId: z.string().min(1).max(100),
  email: z.string().email().max(255),
  message: z.string().max(5000).optional(),
  [CONFIG.HONEYPOT_FIELD]: z.string().max(0).optional() // должно быть пустым
});

// ====================== FASTIFY СЕРВЕР ======================
const fastify = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    }
  }
});

// ====================== MIDDLEWARE: RATE LIMITING ======================
fastify.addHook('onRequest', async (request, reply) => {
  if (request.url !== '/api/submit' || request.method !== 'POST') return;

  const clientIp = request.ip;
  const key = `rate_limit:${clientIp}`;

  try {
    // Сначала проверяем honeypot ДО rate limiting
    // (чтобы спам-запросы не тратили лимит)

    // Пытаемся получить тело запроса для honeypot проверки
    // Важно: Fastify ещё не распарсил body на этом этапе
    // Поэтому временно отключаем honeypot проверку в middleware
    // и оставляем её в основном обработчике

    // Далее проверка rate limiting как есть...
    const multi = redis.multi();
    multi.incr(key);
    multi.ttl(key);

    const results = await multi.exec();

    if (results && results[0] && results[1]) {
      const requestCount = results[0][1] as number;
      const ttl = results[1][1] as number;

      if (requestCount === 1 && ttl === -1) {
        await redis.expire(key, CONFIG.RATE_LIMIT.WINDOW_MS / 1000);
      }

      if (requestCount > CONFIG.RATE_LIMIT.MAX_REQUESTS) {
        console.log(`🚫 Rate limit exceeded: ${clientIp} (${requestCount} requests)`);

        reply.code(429).send({
          success: false,
          message: CONFIG.RATE_LIMIT.MESSAGE,
          retryAfter: `${Math.ceil(ttl / 60)} minutes`,
          limit: CONFIG.RATE_LIMIT.MAX_REQUESTS
        });

        throw new Error('RATE_LIMIT_EXCEEDED');
      }

      console.log(`📊 Rate: ${clientIp} = ${requestCount}/${CONFIG.RATE_LIMIT.MAX_REQUESTS}`);
    }
  } catch (error) {
    if (error.message === 'RATE_LIMIT_EXCEEDED') throw error;
    console.warn('⚠️ Redis unavailable, skipping rate limit');
  }
});

// ====================== ЭНДПОИНТЫ ======================

// Health check с проверкой всех зависимостей
fastify.get('/health', async (request, reply) => {
  const checks: Record<string, string> = {
    api: 'OK',
    postgres: 'CHECKING',
    redis: 'CHECKING'
  };

  try {
    // Проверяем PostgreSQL
    await pool.query('SELECT 1');
    checks.postgres = 'OK';
  } catch (error) {
    checks.postgres = 'ERROR';
    console.error('PostgreSQL health check failed:', error);
  }

  try {
    // Проверяем Redis
    await redis.ping();
    checks.redis = 'OK';
  } catch (error) {
    checks.redis = 'ERROR';
    console.error('Redis health check failed:', error);
  }

  const allOk = checks.postgres === 'OK';

  return reply.code(allOk ? 200 : 503).send({
    status: allOk ? 'OK' : 'DEGRADED',
    service: 'FreeFormAPI',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks,
    rateLimit: {
      enabled: checks.redis === 'OK',
      maxRequests: CONFIG.RATE_LIMIT.MAX_REQUESTS,
      window: '1 hour'
    }
  });
});

// Основной эндпоинт для форм
fastify.post('/api/submit', async (request, reply) => {
  try {
    // 1. Валидация данных
    const validation = formSchema.safeParse(request.body);

    if (!validation.success) {
      console.log('❌ Validation failed:', validation.error.issues);

      return reply.code(400).send({
        success: false,
        message: 'Validation failed',
        errors: validation.error.issues.map(issue => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code
        }))
      });
    }

    const formData = validation.data;
    const clientIp = request.ip;

    // 2. Проверка honeypot (антиспам)
    if (formData[CONFIG.HONEYPOT_FIELD] && formData[CONFIG.HONEYPOT_FIELD] !== '') {
      console.log(`🤖 Spam detected (honeypot) from IP: ${clientIp}`);

      // Логируем попытку спама, но возвращаем успех
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

      // Возвращаем успех, но не показываем, что это спам
      return {
        success: true,
        message: 'Form received successfully!'
      };
    }

    // 3. Сохранение в PostgreSQL
    const result = await pool.query(
      `INSERT INTO form_submissions 
       (form_id, email, message, ip_address, user_agent, status) 
       VALUES ($1, $2, $3, $4, $5, 'pending') 
       RETURNING id, created_at`,
      [
        formData.formId,
        formData.email,
        formData.message || null,
        clientIp,
        request.headers['user-agent'] || ''
      ]
    );

    const submission = result.rows[0];

    console.log('📨 Form saved:', {
      id: submission.id,
      formId: formData.formId,
      email: formData.email,
      ip: clientIp
    });

    // 4. Успешный ответ
    return {
      success: true,
      message: 'Form received and saved!',
      submissionId: submission.id,
      createdAt: submission.created_at,
      rateLimit: {
        remaining: await getRemainingRequests(clientIp),
        window: '1 hour'
      }
    };

  } catch (error) {
    console.error('Form submission error:', error);

    // Если это не ошибка rate limiting (она обработана в хуке)
    if (error.message !== 'RATE_LIMIT_EXCEEDED') {
      return reply.code(500).send({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    throw error; // Пробрасываем rate limit ошибку дальше
  }
});

// Вспомогательная функция для получения оставшихся запросов
async function getRemainingRequests(ip: string): Promise<number> {
  try {
    const key = `rate_limit:${ip}`;
    const current = await redis.get(key);
    return current ? Math.max(0, CONFIG.RATE_LIMIT.MAX_REQUESTS - parseInt(current)) : CONFIG.RATE_LIMIT.MAX_REQUESTS;
  } catch {
    return CONFIG.RATE_LIMIT.MAX_REQUESTS; // Если Redis недоступен
  }
}

// Корневой эндпоинт
fastify.get('/', async (request, reply) => {
  let dbStats = { submissions: 0, pending: 0 };

  try {
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
const start = async () => {
  try {
    // Проверяем подключение к БД при старте
    await pool.connect();
    console.log('✅ Connected to PostgreSQL');

    // Проверяем Redis (но не блокируем запуск если он недоступен)
    try {
      await redis.ping();
      console.log('✅ Connected to Redis');
    } catch (error) {
      console.warn('⚠️ Redis not available, rate limiting disabled');
    }

    // Запускаем сервер
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('🚀 FreeFormAPI server running on http://localhost:3000');
    console.log('✅ Health check: http://localhost:3000/health');
    console.log('📊 Database: PostgreSQL 18.1 (freeformapi)');

  } catch (err) {
    console.error('❌ Server startup error:', err);
    process.exit(1);
  }
};

start();

// ====================== ОБРАБОТКА ЗАВЕРШЕНИЯ ======================
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');

  await fastify.close();
  await pool.end();
  await redis.quit();

  console.log('Server shut down');
  process.exit(0);
});