/**
 * Настройка и создание Fastify сервера
 */

import Fastify, { FastifyInstance, FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import { SERVER_CONFIG } from '../config';

/**
 * Создает и настраивает экземпляр Fastify сервера
 * @param options Дополнительные опции Fastify
 * @returns Настроенный экземпляр Fastify
 */
export function createServer(options: FastifyServerOptions = {}): FastifyInstance {
  // Настраиваем логгер в зависимости от окружения
  const loggerConfig = SERVER_CONFIG.NODE_ENV === 'development' 
    ? {
        level: SERVER_CONFIG.LOG_LEVEL,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname'
          }
        }
      }
    : {
        level: SERVER_CONFIG.LOG_LEVEL
      };

  const server = Fastify({
    logger: loggerConfig,
    trustProxy: SERVER_CONFIG.TRUST_PROXY,
    ...options
  });

  // Настраиваем CORS
  server.register(cors, {
    origin: SERVER_CONFIG.CORS_ORIGINS,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400, // 24 часа
  });

  // Добавляем хук для логирования запросов
  server.addHook('onRequest', async (request, reply) => {
    if (SERVER_CONFIG.NODE_ENV === 'development') {
      console.log(`📥 ${request.method} ${request.url} - IP: ${request.ip}`);
    }
    
    request.log.info({
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'] || 'unknown'
    }, 'Входящий запрос');
  });

  // Добавляем хук для логирования ответов
  server.addHook('onResponse', async (request, reply) => {
    // Используем reply.elapsedTime вместо reply.getResponseTime()
    const elapsedTime = reply.elapsedTime || 0;
    
    if (SERVER_CONFIG.NODE_ENV === 'development') {
      console.log(`📤 ${request.method} ${request.url} - Status: ${reply.statusCode} - Time: ${elapsedTime.toFixed(2)}ms`);
    }
    
    request.log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: elapsedTime.toFixed(2)
    }, 'Исходящий ответ');
  });

  return server;
}

/**
 * Запускает сервер
 * @param server Экземпляр Fastify
 * @param port Порт (переопределяет конфигурацию)
 * @param host Хост (переопределяет конфигурацию)
 */
export async function startServer(
  server: FastifyInstance,
  port?: number,
  host?: string
): Promise<void> {
  try {
    const serverPort = port || SERVER_CONFIG.PORT;
    const serverHost = host || SERVER_CONFIG.HOST;
    
    await server.listen({ port: serverPort, host: serverHost });
    
    // Используем console.log вместо server.log для гарантии вывода
    console.log(`🚀 FreeFormAPI сервер запущен на ${serverHost}:${serverPort}`);
    console.log(`🌐 Режим: ${SERVER_CONFIG.NODE_ENV}`);
    console.log(`📊 Логирование: ${SERVER_CONFIG.LOG_LEVEL}`);
    
  } catch (error) {
    console.error('❌ Ошибка запуска сервера:', error);
    process.exit(1);
  }
}

/**
 * Грациозно останавливает сервер
 * @param server Экземпляр Fastify
 */
export async function stopServer(server: FastifyInstance): Promise<void> {
  try {
    await server.close();
    console.log('👋 Сервер остановлен');
  } catch (error) {
    console.error('❌ Ошибка остановки сервера:', error);
  }
}