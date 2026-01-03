/**
 * Сервис обработки форм для FreeFormAPI
 * Основная бизнес-логика обработки отправки форм
 */

import { SessionService } from './session.service';
import { DatabaseService, FormSubmissionData } from './database.service';
import { ValidationResult, SessionData } from '../types';
import { RATE_LIMIT_CONFIG, SECURITY_CONFIG } from '../config';

export interface FormSubmitRequest {
  formId: string;
  email: string;
  message?: string;
  _sessionId: string;
  [key: string]: any; // Для динамических полей (honeypot)
}

export interface FormSubmitResult {
  success: boolean;
  message: string;
  submissionId?: number;
  createdAt?: Date;
  errors?: Array<{ field: string; message: string }>;
  isSpam?: boolean;
}

export class FormService {
  constructor(
    private sessionService: SessionService,
    private databaseService: DatabaseService
  ) {}

  /**
   * Обрабатывает отправку формы
   * @param request Данные формы
   * @param clientIp IP адрес клиента
   * @param userAgent User-Agent клиента
   * @returns Promise<FormSubmitResult> Результат обработки
   */
  async submitForm(
    request: FormSubmitRequest,
    clientIp: string,
    userAgent: string
  ): Promise<FormSubmitResult> {
    console.log('\n=== ОБРАБОТКА ФОРМЫ ===');
    console.log('Форма:', request.formId);
    console.log('Email:', request.email);
    console.log('IP:', clientIp);
    console.log('Session ID:', request._sessionId);

    // 1. Получаем сессию
    const session = await this.sessionService.getSession(request._sessionId);
    
    // 2. Проверяем сессию
    const sessionValidation = this.sessionService.validateSession(request._sessionId, session);
    if (!sessionValidation.valid) {
      await this.sessionService.incrementAttempts(request._sessionId);
      
      return {
        success: false,
        message: sessionValidation.message || 'Ошибка сессии',
        errors: [{
          field: '_sessionId',
          message: sessionValidation.message || 'Ошибка сессии'
        }]
      };
    }

    // 3. Проверяем honeypot (если включено)
    if (SECURITY_CONFIG.HONEYPOT_ENABLED) {
      const isSpam = this.sessionService.checkHoneypotSpam(request, session!);
      
      if (isSpam) {
        console.log(`🚨 ОБНАРУЖЕН СПАМ! Сессия: ${request._sessionId}, IP: ${clientIp}`);
        
        // Сохраняем как спам
        const spamData: FormSubmissionData = {
          formId: request.formId || 'unknown',
          email: request.email || 'spam@example.com',
          message: request.message || '[BOT - honeypot защита сработала]',
          ipAddress: clientIp,
          userAgent: userAgent,
          isSpam: true,
          metadata: {
            sessionId: request._sessionId,
            honeypotField: session!.honeypotField,
            detectedFields: Object.keys(request).filter(k => k.startsWith('_hp_'))
          }
        };

        const submission = await this.databaseService.saveSpamSubmission(
          spamData,
          'honeypot_triggered',
          { honeypotFields: Object.keys(request).filter(k => k.startsWith('_hp_')) }
        );

        // Помечаем сессию как использованную
        await this.sessionService.markSessionAsUsed(request._sessionId, clientIp, userAgent);

        // Возвращаем ложный успех для бота
        return {
          success: true,
          message: 'Форма успешно отправлена!',
          submissionId: submission.id,
          createdAt: submission.created_at,
          isSpam: true
        };
      }
    }

    // 4. Валидируем основные поля
    const validation = this.validateFormData(request, session!);
    if (!validation.success) {
      await this.sessionService.incrementAttempts(request._sessionId);
      
      return {
        success: false,
        message: 'Ошибка валидации данных',
        errors: validation.errors
      };
    }

    // 5. Помечаем сессию как использованную (успешная отправка)
    await this.sessionService.markSessionAsUsed(request._sessionId, clientIp, userAgent);

    // 6. Сохраняем в базу данных
    const formData: FormSubmissionData = {
      formId: request.formId,
      email: request.email,
      message: request.message,
      ipAddress: clientIp,
      userAgent: userAgent,
      isSpam: false,
      status: 'pending',
      metadata: {
        sessionId: request._sessionId,
        honeypotField: session!.honeypotField,
        validatedAt: new Date().toISOString()
      }
    };

    try {
      const submission = await this.databaseService.saveFormSubmission(formData);

      console.log('📨 Форма успешно сохранена:', {
        id: submission.id,
        sessionId: request._sessionId,
        email: request.email,
        timestamp: submission.created_at
      });

      return {
        success: true,
        message: 'Форма успешно отправлена и сохранена!',
        submissionId: submission.id,
        createdAt: submission.created_at
      };

    } catch (error) {
      console.error('❌ Ошибка сохранения формы:', error);
      
      return {
        success: false,
        message: 'Внутренняя ошибка сервера при сохранении формы'
      };
    }
  }

  /**
   * Валидирует данные формы
   * @param data Данные формы
   * @param session Данные сессии
   * @returns ValidationResult Результат валидации
   */
  private validateFormData(data: FormSubmitRequest, session: SessionData): ValidationResult {
    const errors: Array<{ field: string; message: string }> = [];

    // Проверка formId
    if (!data.formId || data.formId.trim() === '') {
      errors.push({ field: 'formId', message: 'ID формы обязательно для заполнения' });
    } else if (data.formId.length > 100) {
      errors.push({ field: 'formId', message: 'ID формы не может превышать 100 символов' });
    }

    // Проверка email
    if (!data.email || data.email.trim() === '') {
      errors.push({ field: 'email', message: 'Email обязательно для заполнения' });
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        errors.push({ field: 'email', message: 'Неверный формат email адреса' });
      } else if (data.email.length > 255) {
        errors.push({ field: 'email', message: 'Email не может превышать 255 символов' });
      }
    }

    // Проверка сообщения
    if (data.message && data.message.length > 5000) {
      errors.push({ field: 'message', message: 'Сообщение не может превышать 5000 символов' });
    }

    // Проверка сессии
    if (!data._sessionId || data._sessionId.trim() === '') {
      errors.push({ field: '_sessionId', message: 'ID сессии обязательно для заполнения' });
    } else if (data._sessionId.length > 100) {
      errors.push({ field: '_sessionId', message: 'ID сессии не может превышать 100 символов' });
    }

    // Проверка honeypot поля (должно быть пустым или отсутствовать)
    if (data[session.honeypotField] && data[session.honeypotField].toString().trim() !== '') {
      errors.push({ 
        field: session.honeypotField, 
        message: 'Это поле должно быть пустым' 
      });
    }

    return {
      success: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Получает статистику по формам
   * @returns Promise со статистикой
   */
  async getStats(): Promise<{
    submissions: any;
    sessions: { activeSessions: number };
    rateLimit: { maxRequests: number; window: string };
  }> {
    const [submissions, sessions] = await Promise.all([
      this.databaseService.getStats(),
      this.sessionService.getStats()
    ]);

    return {
      submissions,
      sessions,
      rateLimit: {
        maxRequests: RATE_LIMIT_CONFIG.MAX_REQUESTS,
        window: '1 час'
      }
    };
  }
}