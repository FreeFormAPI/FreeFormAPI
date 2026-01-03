/**
 * Валидация данных форм с использованием Zod
 */

import { z } from 'zod';
import { ValidationResult } from '../types';

/**
 * Создает схему валидации для данных формы
 * @param honeypotField Имя динамического honeypot поля
 * @returns Zod схема для валидации
 */
export function createFormSchema(honeypotField: string) {
  return z.object({
    formId: z.string()
      .min(1, { message: 'ID формы обязательно для заполнения' })
      .max(100, { message: 'ID формы не может превышать 100 символов' })
      .trim(),

    email: z.string()
      .min(1, { message: 'Email обязательно для заполнения' })
      .email({ message: 'Неверный формат email адреса' })
      .max(255, { message: 'Email не может превышать 255 символов' })
      .trim()
      .toLowerCase(),

    message: z.string()
      .max(5000, { message: 'Сообщение не может превышать 5000 символов' })
      .optional()
      .default(''),

    // Динамическое honeypot поле (должно быть пустым)
    [honeypotField]: z.string()
      .optional()
      .default('')
      .refine(val => !val || val.trim() === '', {
        message: 'Это поле должно быть пустым'
      }),

    // ID сессии (обязательное поле)
    _sessionId: z.string()
      .min(1, { message: 'ID сессии обязательно для заполнения' })
      .max(100, { message: 'ID сессии не может превышать 100 символов' })
      .trim()
  });
}

/**
 * Валидирует данные формы с помощью Zod
 * @param data Данные для валидации
 * @param honeypotField Имя honeypot поля
 * @returns Результат валидации
 */
export function validateFormData(
  data: any, 
  honeypotField: string
): ValidationResult {
  try {
    const schema = createFormSchema(honeypotField);
    const validation = schema.safeParse(data);

    if (!validation.success) {
      const errors = validation.error.errors.map(error => ({
        field: error.path.join('.'),
        message: error.message,
        code: error.code || 'VALIDATION_ERROR'
      }));

      return {
        success: false,
        errors
      };
    }

    return {
      success: true,
      data: validation.data
    };

  } catch (error) {
    console.error('❌ Ошибка валидации:', error);
    
    return {
      success: false,
      errors: [{
        field: 'unknown',
        message: 'Ошибка валидации данных',
        code: 'VALIDATION_ERROR'
      }]
    };
  }
}

/**
 * Валидирует email
 */
export function validateEmail(email: string): boolean {
  const emailSchema = z.string().email();
  return emailSchema.safeParse(email).success;
}

/**
 * Валидирует ID формы
 */
export function validateFormId(formId: string): boolean {
  const formIdSchema = z.string().min(1).max(100);
  return formIdSchema.safeParse(formId).success;
}

/**
 * Валидирует сообщение
 */
export function validateMessage(message: string): boolean {
  const messageSchema = z.string().max(5000);
  return messageSchema.safeParse(message).success;
}

/**
 * Валидирует ID сессии
 */
export function validateSessionId(sessionId: string): boolean {
  const sessionIdSchema = z.string().min(1).max(100);
  return sessionIdSchema.safeParse(sessionId).success;
}

/**
 * Проверяет honeypot поле
 */
export function validateHoneypot(
  data: Record<string, any>, 
  honeypotField: string
): { isValid: boolean; message?: string } {
  const value = data[honeypotField];
  
  if (value === undefined || value === null) {
    return { isValid: true }; // Поле отсутствует - нормально
  }

  if (typeof value === 'string' && value.trim() === '') {
    return { isValid: true }; // Пустая строка - нормально
  }

  // Проверяем все honeypot поля (старые тоже)
  const allHoneypotFields = Object.keys(data).filter(key => key.startsWith('_hp_'));
  const filledHoneypots = allHoneypotFields.filter(field => {
    const fieldValue = data[field];
    return fieldValue && fieldValue.toString().trim() !== '';
  });

  if (filledHoneypots.length > 0) {
    return {
      isValid: false,
      message: `Обнаружены заполненные honeypot поля: ${filledHoneypots.join(', ')}`
    };
  }

  return { isValid: true };
}

/**
 * Экспорт всех валидаторов
 */
export const FormValidators = {
  createFormSchema,
  validateFormData,
  validateEmail,
  validateFormId,
  validateMessage,
  validateSessionId,
  validateHoneypot
};

/**
 * Типы для валидации
 */
export interface FormValidationData {
  formId: string;
  email: string;
  message?: string;
  _sessionId: string;
}

export type ValidatedFormData = z.infer<ReturnType<typeof createFormSchema>>;