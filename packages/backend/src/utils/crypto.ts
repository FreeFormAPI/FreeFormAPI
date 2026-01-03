/**
 * Криптографические утилиты для FreeFormAPI
 */

import { randomBytes, createHash } from 'crypto';

/**
 * Генерирует случайный идентификатор сессии
 * @returns 32-символьный hex-идентификатор
 */
export function generateSessionId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Генерирует случайный токен указанной длины
 * @param length Длина токена в байтах (по умолчанию 32)
 * @returns Hex-строка токена
 */
export function generateToken(length: number = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Создает хеш SHA-256 от данных
 * @param data Данные для хеширования
 * @returns Hex-строка хеша
 */
export function createHashSHA256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Создает безопасный идентификатор для honeypot поля
 * @param sessionId ID сессии
 * @returns Имя honeypot поля
 */
export function generateHoneypotFieldName(sessionId: string): string {
  // Используем первые 8 символов sessionId для создания уникального имени
  const prefix = '_hp_';
  const suffix = sessionId.slice(0, 8);
  return `${prefix}${suffix}`;
}

/**
 * Проверяет, является ли строка валидным hex
 * @param str Строка для проверки
 * @returns true если строка является валидным hex
 */
export function isValidHex(str: string): boolean {
  return /^[0-9a-fA-F]+$/.test(str);
}

/**
 * Генерирует случайное число в диапазоне
 * @param min Минимальное значение
 * @param max Максимальное значение
 * @returns Случайное число
 */
export function getRandomInt(min: number, max: number): number {
  const range = max - min + 1;
  return Math.floor(Math.random() * range) + min;
}