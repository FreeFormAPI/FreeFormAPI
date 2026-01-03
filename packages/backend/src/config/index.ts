/**
 * Конфигурация приложения FreeFormAPI
 * Все настройки берутся из переменных окружения
 */

import dotenv from 'dotenv';

// Загружаем переменные окружения
dotenv.config();

/**
 * Конфигурация базы данных PostgreSQL
 */
export const DB_CONFIG = {
  HOST: process.env.DB_HOST || 'localhost',
  PORT: parseInt(process.env.DB_PORT || '5432'),
  NAME: process.env.DB_NAME || 'freeformapi',
  USER: process.env.DB_USER || 'developer',
  PASSWORD: process.env.DB_PASSWORD || 'password',
  MAX_CONNECTIONS: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
  IDLE_TIMEOUT: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
};

/**
 * Конфигурация Redis для кэширования и rate limiting
 */
export const REDIS_CONFIG = {
  HOST: process.env.REDIS_HOST || 'localhost',
  PORT: parseInt(process.env.REDIS_PORT || '6379'),
  PASSWORD: process.env.REDIS_PASSWORD || 'password',
  MAX_RETRIES: parseInt(process.env.REDIS_MAX_RETRIES || '3'),
  RETRY_DELAY: parseInt(process.env.REDIS_RETRY_DELAY || '50'),
};

/**
 * Конфигурация ограничения частоты запросов
 */
export const RATE_LIMIT_CONFIG = {
  WINDOW_MS: 60 * 60 * 1000, // 1 час
  MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  MESSAGE: 'Слишком много запросов с вашего IP-адреса. Пожалуйста, повторите попытку позже.',
  ENABLED: process.env.RATE_LIMIT_ENABLED !== 'false', // По умолчанию включено
};

/**
 * Конфигурация сессий для honeypot защиты
 */
export const SESSION_CONFIG = {
  TTL: parseInt(process.env.SESSION_TTL || '600'), // 10 минут в секундах
  PREFIX: process.env.SESSION_PREFIX || 'session:',
  HONEYPOT_PREFIX: process.env.HONEYPOT_PREFIX || '_hp_',
  MAX_ATTEMPTS: parseInt(process.env.SESSION_MAX_ATTEMPTS || '5'),
};

/**
 * Конфигурация сервера
 */
export const SERVER_CONFIG = {
  PORT: parseInt(process.env.PORT || '3000'),
  HOST: process.env.HOST || '0.0.0.0',
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://localhost:8000,http://localhost:3000').split(','),
  TRUST_PROXY: process.env.TRUST_PROXY === 'true',
};

/**
 * Конфигурация безопасности
 */
export const SECURITY_CONFIG = {
  HONEYPOT_ENABLED: process.env.HONEYPOT_ENABLED !== 'false',
  VALIDATION_ENABLED: process.env.VALIDATION_ENABLED !== 'false',
  SESSION_ENABLED: process.env.SESSION_ENABLED !== 'false',
  TRUST_PROXY: process.env.TRUST_PROXY === 'true',
};

/**
 * Конфигурация приложения
 */
export const APP_CONFIG = {
  NAME: 'FreeFormAPI',
  VERSION: process.env.APP_VERSION || '1.2.0',
  DESCRIPTION: 'Сервис обработки HTML-форм с защитой от спама',
  AUTHOR: 'Команда FreeFormAPI',
  LICENSE: 'MIT',
};

// Экспортируем все конфигурации одним объектом для удобства
export default {
  DB: DB_CONFIG,
  REDIS: REDIS_CONFIG,
  RATE_LIMIT: RATE_LIMIT_CONFIG,
  SESSION: SESSION_CONFIG,
  SERVER: SERVER_CONFIG,
  SECURITY: SECURITY_CONFIG,
  APP: APP_CONFIG,
};