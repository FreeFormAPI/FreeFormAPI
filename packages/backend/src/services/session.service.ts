/**
 * Сервис управления сессиями для FreeFormAPI
 * Отвечает за создание, валидацию и управление сессиями форм
 */

import Redis from 'ioredis';
import { SESSION_CONFIG } from '../config';
import { generateSessionId, generateHoneypotFieldName } from '../utils/crypto';
import { SessionData, NewSession } from '../types';

export class SessionService {
  private redis: Redis;

  constructor(redisClient: Redis) {
    this.redis = redisClient;
  }

  /**
   * Создает новую сессию с уникальным honeypot полем
   * @returns Promise<NewSession> Данные новой сессии
   */
  async createSession(): Promise<NewSession> {
    const sessionId = generateSessionId();
    const honeypotField = generateHoneypotFieldName(sessionId);
    
    const sessionData: SessionData = {
      honeypotField,
      createdAt: Date.now(),
      used: false,
      attempts: 0,
    };

    const key = `${SESSION_CONFIG.PREFIX}${sessionId}`;
    
    try {
      await this.redis.setex(key, SESSION_CONFIG.TTL, JSON.stringify(sessionData));
      
      console.log(`📝 Создана новая сессия: ${sessionId}, honeypot: ${honeypotField}`);
      
      return {
        sessionId,
        honeypotField,
        expiresIn: SESSION_CONFIG.TTL,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('❌ Ошибка создания сессии:', error);
      throw new Error('Не удалось создать сессию');
    }
  }

  /**
   * Получает данные сессии по ID
   * @param sessionId ID сессии
   * @returns Promise<SessionData|null> Данные сессии или null если не найдена
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    const key = `${SESSION_CONFIG.PREFIX}${sessionId}`;
    
    try {
      const sessionRaw = await this.redis.get(key);
      
      if (!sessionRaw) {
        return null;
      }

      const session = JSON.parse(sessionRaw) as SessionData;
      
      // Обновляем время последнего доступа
      session.lastAccess = Date.now();
      await this.redis.setex(key, SESSION_CONFIG.TTL, JSON.stringify(session));
      
      return session;
    } catch (error) {
      console.error('❌ Ошибка получения сессии:', error);
      return null;
    }
  }

  /**
   * Помечает сессию как использованную
   * @param sessionId ID сессии
   * @param ip IP адрес клиента
   * @param userAgent User-Agent клиента
   */
  async markSessionAsUsed(
    sessionId: string, 
    ip: string, 
    userAgent: string
  ): Promise<void> {
    const key = `${SESSION_CONFIG.PREFIX}${sessionId}`;
    
    try {
      const sessionRaw = await this.redis.get(key);
      
      if (!sessionRaw) {
        return;
      }

      const session = JSON.parse(sessionRaw) as SessionData;
      session.used = true;
      session.usedAt = Date.now();
      session.ip = ip;
      session.userAgent = userAgent;

      // После использования уменьшаем TTL до 5 минут
      await this.redis.setex(key, 300, JSON.stringify(session));
      
      console.log(`📌 Сессия ${sessionId} помечена как использованная`);
    } catch (error) {
      console.error('❌ Ошибка отметки сессии:', error);
    }
  }

  /**
   * Увеличивает счетчик попыток для сессии
   * @param sessionId ID сессии
   */
  async incrementAttempts(sessionId: string): Promise<void> {
    const key = `${SESSION_CONFIG.PREFIX}${sessionId}`;
    
    try {
      const sessionRaw = await this.redis.get(key);
      
      if (!sessionRaw) {
        return;
      }

      const session = JSON.parse(sessionRaw) as SessionData;
      session.attempts = (session.attempts || 0) + 1;
      
      await this.redis.setex(key, SESSION_CONFIG.TTL, JSON.stringify(session));
      
      console.log(`📊 Сессия ${sessionId}: попытка ${session.attempts}`);
    } catch (error) {
      console.error('❌ Ошибка увеличения счетчика попыток:', error);
    }
  }

  /**
   * Проверяет honeypot поля на спам
   * @param body Тело запроса
   * @param session Данные сессии
   * @returns true если обнаружен спам
   */
  checkHoneypotSpam(body: Record<string, any>, session: SessionData): boolean {
    const currentHoneypot = session.honeypotField;

    // 1. Проверяем текущее honeypot поле из сессии
    if (body[currentHoneypot] && body[currentHoneypot].toString().trim() !== '') {
      console.log(`🤖 Бот обнаружен по honeypot полю: ${currentHoneypot}="${body[currentHoneypot]}"`);
      return true;
    }

    // 2. Проверяем все старые honeypot поля (начинающиеся с _hp_)
    const allHoneypotFields = Object.keys(body).filter(key => key.startsWith('_hp_'));
    
    for (const field of allHoneypotFields) {
      const value = body[field];
      if (value && value.toString().trim() !== '') {
        console.log(`🤖 Бот обнаружен по СТАРОМУ honeypot полю: ${field}="${value}"`);
        return true;
      }
    }

    return false;
  }

  /**
   * Проверяет валидность сессии
   * @param sessionId ID сессии
   * @param session Данные сессии
   * @returns Объект с результатом проверки
   */
  validateSession(sessionId: string, session: SessionData | null): {
    valid: boolean;
    message?: string;
    code?: string;
  } {
    if (!sessionId) {
      return { valid: false, message: 'ID сессии обязательно для заполнения', code: 'SESSION_REQUIRED' };
    }

    if (!session) {
      return { valid: false, message: 'Недействительная или просроченная сессия', code: 'SESSION_INVALID' };
    }

    if (session.used) {
      return { valid: false, message: 'Эта форма уже была отправлена ранее', code: 'SESSION_USED' };
    }

    if (session.attempts >= SESSION_CONFIG.MAX_ATTEMPTS) {
      return { valid: false, message: 'Превышено максимальное количество попыток', code: 'MAX_ATTEMPTS' };
    }

    return { valid: true };
  }

  /**
   * Удаляет сессию
   * @param sessionId ID сессии
   */
  async deleteSession(sessionId: string): Promise<void> {
    const key = `${SESSION_CONFIG.PREFIX}${sessionId}`;
    
    try {
      await this.redis.del(key);
      console.log(`🗑️ Сессия ${sessionId} удалена`);
    } catch (error) {
      console.error('❌ Ошибка удаления сессии:', error);
    }
  }

  /**
   * Получает статистику по сессиям
   * @returns Promise с количеством активных сессий
   */
  async getStats(): Promise<{ activeSessions: number }> {
    try {
      const keys = await this.redis.keys(`${SESSION_CONFIG.PREFIX}*`);
      return { activeSessions: keys.length };
    } catch (error) {
      console.error('❌ Ошибка получения статистики сессий:', error);
      return { activeSessions: 0 };
    }
  }
}