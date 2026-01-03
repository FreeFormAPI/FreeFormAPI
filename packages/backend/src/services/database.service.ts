/**
 * Сервис работы с базой данных PostgreSQL для FreeFormAPI
 * Отвечает за сохранение, получение и управление данными форм
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import { FormSubmission } from '../types';

export interface FormSubmissionData {
  formId: string;
  email: string;
  message?: string;
  ipAddress: string;
  userAgent: string;
  isSpam: boolean;
  status?: string;
  metadata?: Record<string, any>;
}

export class DatabaseService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Сохраняет отправку формы в базу данных
   * @param data Данные формы для сохранения
   * @returns Promise<FormSubmission> Сохраненная запись
   */
  async saveFormSubmission(data: FormSubmissionData): Promise<FormSubmission> {
    const {
      formId,
      email,
      message,
      ipAddress,
      userAgent,
      isSpam,
      status = 'pending',
      metadata = {}
    } = data;

    const query = `
      INSERT INTO form_submissions 
        (form_id, email, message, ip_address, user_agent, is_spam, status, metadata) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING 
        id, form_id, email, message, ip_address, user_agent, 
        is_spam, status, metadata, created_at, updated_at
    `;

    const values = [
      formId,
      email,
      message || null,
      ipAddress,
      userAgent,
      isSpam,
      status,
      JSON.stringify(metadata)
    ];

    try {
      const result = await this.pool.query(query, values);
      const submission = result.rows[0] as FormSubmission;
      
      console.log(`💾 Форма сохранена: ID=${submission.id}, форма=${formId}, спам=${isSpam}`);
      
      return submission;
    } catch (error) {
      console.error('❌ Ошибка сохранения формы:', error);
      throw new Error('Не удалось сохранить форму в базу данных');
    }
  }

  /**
   * Сохраняет спам-отправку с детальной информацией
   * @param data Данные формы
   * @param spamReason Причина спама
   * @param spamDetails Детали спама
   * @returns Promise<FormSubmission> Сохраненная запись
   */
  async saveSpamSubmission(
    data: FormSubmissionData, 
    spamReason: string,
    spamDetails: Record<string, any>
  ): Promise<FormSubmission> {
    const metadata = {
      ...data.metadata,
      spamReason,
      spamDetails,
      detectedAt: new Date().toISOString()
    };

    return this.saveFormSubmission({
      ...data,
      isSpam: true,
      status: 'blocked',
      metadata
    });
  }

  /**
   * Получает отправку по ID
   * @param id ID отправки
   * @returns Promise<FormSubmission | null> Найденная запись или null
   */
  async getFormSubmission(id: number): Promise<FormSubmission | null> {
    const query = `
      SELECT 
        id, form_id, email, message, ip_address, user_agent, 
        is_spam, status, metadata, created_at, updated_at
      FROM form_submissions 
      WHERE id = $1
    `;

    try {
      const result = await this.pool.query(query, [id]);
      return result.rows[0] as FormSubmission || null;
    } catch (error) {
      console.error('❌ Ошибка получения отправки:', error);
      return null;
    }
  }

  /**
   * Получает статистику по отправкам
   * @returns Promise с различной статистикой
   */
  async getStats(): Promise<{
    total: number;
    pending: number;
    processed: number;
    blocked: number;
    spamCount: number;
    last24Hours: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'processed' THEN 1 END) as processed,
        COUNT(CASE WHEN status = 'blocked' THEN 1 END) as blocked,
        COUNT(CASE WHEN is_spam = true THEN 1 END) as spam_count,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as last_24_hours
      FROM form_submissions
    `;

    try {
      const result = await this.pool.query(query);
      const row = result.rows[0];
      
      return {
        total: parseInt(row.total) || 0,
        pending: parseInt(row.pending) || 0,
        processed: parseInt(row.processed) || 0,
        blocked: parseInt(row.blocked) || 0,
        spamCount: parseInt(row.spam_count) || 0,
        last24Hours: parseInt(row.last_24_hours) || 0
      };
    } catch (error) {
      console.error('❌ Ошибка получения статистики:', error);
      return {
        total: 0,
        pending: 0,
        processed: 0,
        blocked: 0,
        spamCount: 0,
        last24Hours: 0
      };
    }
  }

  /**
   * Получает последние отправки
   * @param limit Лимит записей
   * @returns Promise<FormSubmission[]> Массив отправок
   */
  async getRecentSubmissions(limit: number = 10): Promise<FormSubmission[]> {
    const query = `
      SELECT 
        id, form_id, email, message, ip_address, user_agent, 
        is_spam, status, metadata, created_at, updated_at
      FROM form_submissions 
      ORDER BY created_at DESC 
      LIMIT $1
    `;

    try {
      const result = await this.pool.query(query, [limit]);
      return result.rows as FormSubmission[];
    } catch (error) {
      console.error('❌ Ошибка получения последних отправок:', error);
      return [];
    }
  }

  /**
   * Обновляет статус отправки
   * @param id ID отправки
   * @param status Новый статус
   * @returns Promise<boolean> Успешно ли обновление
   */
  async updateSubmissionStatus(id: number, status: string): Promise<boolean> {
    const query = `
      UPDATE form_submissions 
      SET status = $1, updated_at = NOW() 
      WHERE id = $2
    `;

    try {
      const result = await this.pool.query(query, [status, id]);
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error('❌ Ошибка обновления статуса:', error);
      return false;
    }
  }

  /**
   * Удаляет отправку
   * @param id ID отправки
   * @returns Promise<boolean> Успешно ли удаление
   */
  async deleteSubmission(id: number): Promise<boolean> {
    const query = 'DELETE FROM form_submissions WHERE id = $1';

    try {
      const result = await this.pool.query(query, [id]);
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      console.error('❌ Ошибка удаления отправки:', error);
      return false;
    }
  }

  /**
   * Проверяет существование таблицы form_submissions
   * @returns Promise<boolean> Существует ли таблица
   */
  async checkTableExists(): Promise<boolean> {
    const query = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'form_submissions'
      )
    `;

    try {
      const result = await this.pool.query(query);
      return result.rows[0].exists;
    } catch (error) {
      console.error('❌ Ошибка проверки существования таблицы:', error);
      return false;
    }
  }

  /**
   * Создает таблицу form_submissions если она не существует
   */
  async createTableIfNotExists(): Promise<void> {
    const tableExists = await this.checkTableExists();
    
    if (tableExists) {
      console.log('✅ Таблица form_submissions уже существует');
      return;
    }

    const query = `
      CREATE TABLE form_submissions (
        id SERIAL PRIMARY KEY,
        form_id VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL,
        message TEXT,
        ip_address VARCHAR(45) NOT NULL,
        user_agent TEXT NOT NULL,
        is_spam BOOLEAN DEFAULT false,
        status VARCHAR(50) DEFAULT 'pending',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_form_submissions_form_id ON form_submissions(form_id);
      CREATE INDEX idx_form_submissions_email ON form_submissions(email);
      CREATE INDEX idx_form_submissions_created_at ON form_submissions(created_at);
      CREATE INDEX idx_form_submissions_status ON form_submissions(status);
      CREATE INDEX idx_form_submissions_is_spam ON form_submissions(is_spam);
    `;

    try {
      await this.pool.query(query);
      console.log('✅ Таблица form_submissions создана успешно');
    } catch (error) {
      console.error('❌ Ошибка создания таблицы:', error);
      throw new Error('Не удалось создать таблицу form_submissions');
    }
  }

  /**
   * Получает клиента из пула для транзакций
   * @returns Promise<PoolClient> Клиент базы данных
   */
  async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  /**
   * Выполняет миграцию базы данных
   * @param migrationSql SQL код миграции
   */
  async migrate(migrationSql: string): Promise<void> {
    const client = await this.getClient();
    
    try {
      await client.query('BEGIN');
      await client.query(migrationSql);
      await client.query('COMMIT');
      console.log('✅ Миграция выполнена успешно');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Ошибка миграции:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}