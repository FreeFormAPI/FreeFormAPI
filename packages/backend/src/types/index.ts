/**
 * TypeScript типы для FreeFormAPI
 */

import { FastifyRequest } from 'fastify';

// ==================== БАЗОВЫЕ ТИПЫ ====================

/**
 * Базовая структура ответа API
 */
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  timestamp: string;
}

/**
 * Структура ошибки валидации
 */
export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

// ==================== ФОРМЫ ====================

/**
 * Данные формы для отправки
 */
export interface FormData {
  formId: string;
  email: string;
  message?: string;
  [key: string]: any; // Для динамических полей (honeypot)
}

/**
 * Валидированные данные формы
 */
export interface ValidatedFormData extends FormData {
  _sessionId: string;
}

/**
 * Отправленная форма в базе данных
 */
export interface FormSubmission {
  id: number;
  form_id: string;
  email: string;
  message: string | null;
  ip_address: string;
  user_agent: string;
  is_spam: boolean;
  status: 'pending' | 'processed' | 'blocked' | 'failed';
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

// ==================== СЕССИИ ====================

/**
 * Данные сессии в Redis
 */
export interface SessionData {
  honeypotField: string;
  createdAt: number;
  lastAccess?: number;
  used: boolean;
  usedAt?: number;
  ip?: string;
  userAgent?: string;
  attempts: number;
}

/**
 * Новая созданная сессия
 */
export interface NewSession {
  sessionId: string;
  honeypotField: string;
  expiresIn: number;
  createdAt: string;
}

/**
 * Безопасные данные сессии для ответа клиенту
 */
export interface SafeSessionData {
  sessionId: string;
  honeypotField: string;
  createdAt: string;
  lastAccess?: string | null;
  used: boolean;
  attempts: number;
  expiresIn: number;
  isValid?: boolean;
  errorCode?: string;
}

// ==================== ЗАПРОСЫ ====================

/**
 * Расширенный запрос Fastify с сессией
 */
export interface FreeFormRequest extends FastifyRequest {
  session?: SessionData;
  clientIp: string;
  userAgent: string;
}

// ==================== ВАЛИДАЦИЯ ====================

/**
 * Результат валидации Zod
 */
export interface ValidationResult {
  success: boolean;
  data?: any;
  errors?: ValidationError[];
}

// ==================== АЛИАСЫ ДЛЯ УДОБСТВА ====================

/**
 * Конфигурация подключения к БД (алиас)
 */
export type DBConfig = {
  HOST: string;
  PORT: number;
  NAME: string;
  USER: string;
  PASSWORD: string;
  MAX_CONNECTIONS: number;
  IDLE_TIMEOUT: number;
};

/**
 * Конфигурация Redis (алиас)
 */
export type RedisConfigType = {
  HOST: string;
  PORT: number;
  PASSWORD: string;
  MAX_RETRIES: number;
  RETRY_DELAY: number;
};

/**
 * Конфигурация rate limiting (алиас)
 */
export type RateLimitConfigType = {
  WINDOW_MS: number;
  MAX_REQUESTS: number;
  MESSAGE: string;
  ENABLED: boolean;
};