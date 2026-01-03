/**
 * Константы приложения FreeFormAPI
 * Значения, которые не меняются в зависимости от окружения
 */

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const ERROR_MESSAGES = {
  // Валидация
  VALIDATION_FAILED: 'Ошибка валидации данных',
  INVALID_EMAIL: 'Неверный формат email адреса',
  FIELD_REQUIRED: 'Поле обязательно для заполнения',
  FIELD_TOO_LONG: 'Поле превышает максимальную длину',
  
  // Сессии
  INVALID_SESSION: 'Недействительная или просроченная сессия',
  SESSION_USED: 'Эта форма уже была отправлена ранее',
  SESSION_EXPIRED: 'Сессия истекла. Пожалуйста, обновите страницу',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'Слишком много запросов с вашего IP-адреса',
  
  // Общие ошибки
  INTERNAL_ERROR: 'Внутренняя ошибка сервера',
  DATABASE_ERROR: 'Ошибка подключения к базе данных',
  REDIS_ERROR: 'Ошибка подключения к Redis',
  
  // Успешные сообщения
  FORM_SUBMITTED: 'Форма успешно отправлена и сохранена!',
  SESSION_CREATED: 'Сессия успешно создана',
} as const;

export const LOG_PREFIXES = {
  INFO: 'ℹ️',
  SUCCESS: '✅',
  WARNING: '⚠️',
  ERROR: '❌',
  DEBUG: '🔍',
  DATABASE: '🗄️',
  REDIS: '🔴',
  SERVER: '🚀',
  SECURITY: '🛡️',
} as const;

export const TIME_UNITS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
} as const;

export const VALIDATION_LIMITS = {
  FORM_ID_MAX_LENGTH: 100,
  EMAIL_MAX_LENGTH: 255,
  MESSAGE_MAX_LENGTH: 5000,
  SESSION_ID_MAX_LENGTH: 100,
  HONEYPOT_FIELD_LENGTH: 12, // _hp_ + 8 символов
} as const;