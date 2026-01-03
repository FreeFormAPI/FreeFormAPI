/**
 * Middleware для ограничения частоты запросов (rate limiting)
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { RATE_LIMIT_CONFIG, SECURITY_CONFIG } from '../config';
import { LOG_PREFIXES } from '../config/constants';

export interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  message?: string;
  skip?: (request: FastifyRequest) => boolean;
}

export class RateLimitMiddleware {
  private redis: Redis;
  private options: Required<RateLimitOptions>;

  constructor(
    redisClient: Redis,
    options: RateLimitOptions = {}
  ) {
    this.redis = redisClient;
    
    this.options = {
      windowMs: options.windowMs || RATE_LIMIT_CONFIG.WINDOW_MS,
      maxRequests: options.maxRequests || RATE_LIMIT_CONFIG.MAX_REQUESTS,
      message: options.message || RATE_LIMIT_CONFIG.MESSAGE,
      skip: options.skip || (() => false)
    };
  }

  /**
   * Middleware функция для ограничения запросов
   */
  middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      // Если rate limiting отключен в конфигурации
      if (!SECURITY_CONFIG.HONEYPOT_ENABLED || !RATE_LIMIT_CONFIG.ENABLED) {
        return;
      }

      // Если запрос нужно пропустить
      if (this.options.skip(request)) {
        return;
      }

      const clientIp = request.ip;
      const userAgent = request.headers['user-agent'] || 'unknown';
      const key = `rate_limit:${clientIp}`;

      try {
        // Используем MULTI для атомарных операций
        const multi = this.redis.multi();
        multi.incr(key);
        multi.ttl(key);

        const results = await multi.exec();

        if (results && results[0] && results[1]) {
          const requestCount = results[0][1] as number;
          const ttl = results[1][1] as number;

          // Если это первый запрос - устанавливаем TTL
          if (requestCount === 1 && ttl === -1) {
            await this.redis.expire(key, this.options.windowMs / 1000);
          }

          // Проверяем превышение лимита
          if (requestCount > this.options.maxRequests) {
            console.log(`${LOG_PREFIXES.WARNING} Превышен лимит запросов: ${clientIp} (${requestCount}/${this.options.maxRequests})`);
            
            const retryAfter = Math.ceil(ttl / 60);
            const retryMessage = retryAfter > 0 
              ? `Попробуйте снова через ${retryAfter} минут`
              : 'Попробуйте снова позже';

            reply.code(429).send({
              success: false,
              message: this.options.message,
              retryAfter: retryMessage,
              limit: this.options.maxRequests,
              remaining: 0,
              resetIn: `${ttl} секунд`,
              timestamp: new Date().toISOString()
            });

            throw new Error('RATE_LIMIT_EXCEEDED');
          }

          // Логируем статистику (только для отладки)
          if (process.env.NODE_ENV === 'development') {
            const remaining = Math.max(0, this.options.maxRequests - requestCount);
            console.log(`${LOG_PREFIXES.DEBUG} Rate limit: ${clientIp} = ${requestCount}/${this.options.maxRequests}, осталось: ${remaining}`);
          }

          // Добавляем заголовки для клиента
          reply.header('X-RateLimit-Limit', this.options.maxRequests.toString());
          reply.header('X-RateLimit-Remaining', Math.max(0, this.options.maxRequests - requestCount).toString());
          reply.header('X-RateLimit-Reset', Math.ceil(Date.now() / 1000 + ttl).toString());
        }

      } catch (error) {
        if (error instanceof Error && error.message === 'RATE_LIMIT_EXCEEDED') {
          throw error; // Пробрасываем дальше
        }

        // Если Redis недоступен - пропускаем rate limiting
        console.warn(`${LOG_PREFIXES.WARNING} Redis недоступен, пропускаем ограничение запросов`);
        return;
      }
    };
  }

  /**
   * Регистрирует middleware в Fastify
   */
  register(server: FastifyInstance, paths: string | string[] = '/api/submit') {
    const pathArray = Array.isArray(paths) ? paths : [paths];

    pathArray.forEach(path => {
      server.addHook('onRequest', async (request, reply) => {
        if (request.url === path && request.method === 'POST') {
          await this.middleware()(request, reply);
        }
      });
    });

    console.log(`${LOG_PREFIXES.SUCCESS} Rate limiting зарегистрирован для путей: ${pathArray.join(', ')}`);
  }

  /**
   * Получает информацию о лимитах для IP
   */
  async getLimitInfo(ip: string): Promise<{
    current: number;
    remaining: number;
    limit: number;
    resetIn: number;
    isBlocked: boolean;
  }> {
    const key = `rate_limit:${ip}`;

    try {
      const [currentStr, ttlStr] = await Promise.all([
        this.redis.get(key),
        this.redis.ttl(key)
      ]);

      const current = currentStr ? parseInt(currentStr) : 0;
      const ttl = ttlStr || 0;
      const remaining = Math.max(0, this.options.maxRequests - current);
      const isBlocked = current > this.options.maxRequests;

      return {
        current,
        remaining,
        limit: this.options.maxRequests,
        resetIn: ttl,
        isBlocked
      };

    } catch (error) {
      console.error(`${LOG_PREFIXES.ERROR} Ошибка получения информации о лимитах:`, error);
      
      return {
        current: 0,
        remaining: this.options.maxRequests,
        limit: this.options.maxRequests,
        resetIn: 0,
        isBlocked: false
      };
    }
  }

  /**
   * Сбрасывает счетчик для IP
   */
  async resetLimit(ip: string): Promise<boolean> {
    const key = `rate_limit:${ip}`;

    try {
      await this.redis.del(key);
      console.log(`${LOG_PREFIXES.INFO} Лимит сброшен для IP: ${ip}`);
      return true;
    } catch (error) {
      console.error(`${LOG_PREFIXES.ERROR} Ошибка сброса лимита:`, error);
      return false;
    }
  }
}

/**
 * Фабричная функция для создания middleware
 */
export function createRateLimitMiddleware(
  redisClient: Redis, 
  options?: RateLimitOptions
): RateLimitMiddleware {
  return new RateLimitMiddleware(redisClient, options);
}