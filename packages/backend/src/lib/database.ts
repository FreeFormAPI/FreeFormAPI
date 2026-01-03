/**
 * Инициализация и управление подключениями к базам данных
 */

import { Pool } from 'pg';
import Redis from 'ioredis';
import { DB_CONFIG, REDIS_CONFIG } from '../config';
import { LOG_PREFIXES } from '../config/constants';

/**
 * Создает и настраивает пул подключений к PostgreSQL
 * @returns Настроенный пул подключений
 */
export function createPostgresPool(): Pool {
  console.log(`${LOG_PREFIXES.DATABASE} Создание пула подключений PostgreSQL...`);
  
  const pool = new Pool({
    host: DB_CONFIG.HOST,
    port: DB_CONFIG.PORT,
    database: DB_CONFIG.NAME,
    user: DB_CONFIG.USER,
    password: DB_CONFIG.PASSWORD,
    max: DB_CONFIG.MAX_CONNECTIONS,
    idleTimeoutMillis: DB_CONFIG.IDLE_TIMEOUT,
    connectionTimeoutMillis: 5000,
  });

  // Обработчики событий пула
  pool.on('connect', () => {
    console.log(`${LOG_PREFIXES.SUCCESS} Новое подключение к PostgreSQL`);
  });

  pool.on('error', (err) => {
    console.error(`${LOG_PREFIXES.ERROR} Ошибка пула PostgreSQL:`, err.message);
  });

  pool.on('remove', () => {
    console.log(`${LOG_PREFIXES.INFO} Подключение к PostgreSQL закрыто`);
  });

  return pool;
}

/**
 * Проверяет подключение к PostgreSQL
 * @param pool Пул подключений
 * @returns Promise<boolean> Успешно ли подключение
 */
export async function checkPostgresConnection(pool: Pool): Promise<boolean> {
  try {
    const client = await pool.connect();
    
    // Выполняем простой запрос
    const result = await client.query('SELECT NOW() as time, version() as version');
    
    console.log(`${LOG_PREFIXES.SUCCESS} PostgreSQL подключен`);
    console.log(`${LOG_PREFIXES.DATABASE} Время сервера: ${result.rows[0].time}`);
    console.log(`${LOG_PREFIXES.DATABASE} Версия: ${result.rows[0].version.split(' ')[1]}`);
    
    client.release();
    return true;
  } catch (error) {
    console.error(`${LOG_PREFIXES.ERROR} Ошибка подключения к PostgreSQL:`, error);
    return false;
  }
}

/**
 * Создает и настраивает клиент Redis
 * @returns Настроенный клиент Redis
 */
export function createRedisClient(): Redis {
  console.log(`${LOG_PREFIXES.REDIS} Создание клиента Redis...`);
  
  const redis = new Redis({
    host: REDIS_CONFIG.HOST,
    port: REDIS_CONFIG.PORT,
    password: REDIS_CONFIG.PASSWORD,
    retryStrategy: (times) => {
      const delay = Math.min(times * REDIS_CONFIG.RETRY_DELAY, 2000);
      console.log(`${LOG_PREFIXES.WARNING} Повторное подключение к Redis ${times}, задержка ${delay}мс`);
      return delay;
    },
    maxRetriesPerRequest: REDIS_CONFIG.MAX_RETRIES,
    enableReadyCheck: true,
    autoResendUnfulfilledCommands: true,
  });

  // Обработчики событий Redis
  redis.on('connect', () => {
    console.log(`${LOG_PREFIXES.SUCCESS} Redis подключен`);
  });

  redis.on('ready', () => {
    console.log(`${LOG_PREFIXES.SUCCESS} Redis готов к работе`);
  });

  redis.on('error', (err) => {
    console.error(`${LOG_PREFIXES.ERROR} Ошибка Redis:`, err.message);
  });

  redis.on('close', () => {
    console.log(`${LOG_PREFIXES.INFO} Соединение с Redis закрыто`);
  });

  redis.on('reconnecting', (time) => {
    console.log(`${LOG_PREFIXES.WARNING} Переподключение к Redis через ${time}мс`);
  });

  return redis;
}

/**
 * Проверяет подключение к Redis
 * @param redis Клиент Redis
 * @returns Promise<boolean> Успешно ли подключение
 */
export async function checkRedisConnection(redis: Redis): Promise<boolean> {
  try {
    const result = await redis.ping();
    
    if (result === 'PONG') {
      console.log(`${LOG_PREFIXES.SUCCESS} Redis отвечает`);
      
      // Дополнительная информация о Redis
      const info = await redis.info();
      const versionMatch = info.match(/redis_version:(\d+\.\d+\.\d+)/);
      
      if (versionMatch) {
        console.log(`${LOG_PREFIXES.REDIS} Версия Redis: ${versionMatch[1]}`);
      }
      
      return true;
    }
    
    console.error(`${LOG_PREFIXES.ERROR} Redis не ответил PONG`);
    return false;
  } catch (error) {
    console.error(`${LOG_PREFIXES.ERROR} Ошибка подключения к Redis:`, error);
    return false;
  }
}

/**
 * Грациозно закрывает все подключения к базам данных
 * @param pool Пул PostgreSQL
 * @param redis Клиент Redis
 */
export async function closeDatabaseConnections(pool: Pool, redis: Redis): Promise<void> {
  console.log(`${LOG_PREFIXES.INFO} Закрытие подключений к базам данных...`);
  
  try {
    // Закрываем пул PostgreSQL
    await pool.end();
    console.log(`${LOG_PREFIXES.SUCCESS} Пул PostgreSQL закрыт`);
  } catch (error) {
    console.error(`${LOG_PREFIXES.ERROR} Ошибка закрытия пула PostgreSQL:`, error);
  }
  
  try {
    // Закрываем соединение с Redis
    await redis.quit();
    console.log(`${LOG_PREFIXES.SUCCESS} Соединение с Redis закрыто`);
  } catch (error) {
    console.error(`${LOG_PREFIXES.ERROR} Ошибка закрытия Redis:`, error);
  }
}