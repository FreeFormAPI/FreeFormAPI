/**
 * Контроллер обработки отправки форм для FreeFormAPI
 * HTTP обработчик для эндпоинта /api/submit
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { FormService } from '../services/form.service';
import { SessionService } from '../services/session.service';
import { DatabaseService } from '../services/database.service';
import { RATE_LIMIT_CONFIG } from '../config';
import { LOG_PREFIXES } from '../config/constants';

export class FormController {
  constructor(
    private formService: FormService,
    private sessionService: SessionService,
    private databaseService: DatabaseService
  ) {}

  /**
   * Обрабатывает отправку формы
   * POST /api/submit
   */
  async submit(request: FastifyRequest, reply: FastifyReply) {
    const startTime = Date.now();
    const clientIp = request.ip;
    const userAgent = request.headers['user-agent'] || '';
    
    console.log(`\n${LOG_PREFIXES.SERVER} === НОВАЯ ОТПРАВКА ФОРМЫ ===`);
    console.log(`${LOG_PREFIXES.INFO} IP: ${clientIp}`);
    console.log(`${LOG_PREFIXES.INFO} User-Agent: ${userAgent}`);
    console.log(`${LOG_PREFIXES.INFO} Метод: ${request.method}`);
    console.log(`${LOG_PREFIXES.INFO} URL: ${request.url}`);

    try {
      const body = request.body as any;
      
      if (!body || typeof body !== 'object') {
        console.log(`${LOG_PREFIXES.ERROR} Неверный формат тела запроса`);
        return reply.code(400).send({
          success: false,
          message: 'Неверный формат данных',
          timestamp: new Date().toISOString()
        });
      }

      console.log(`${LOG_PREFIXES.DEBUG} Полученные данные:`, JSON.stringify(body, null, 2));

      // Обрабатываем форму
      const result = await this.formService.submitForm(body, clientIp, userAgent);
      
      const processingTime = Date.now() - startTime;
      console.log(`${LOG_PREFIXES.INFO} Время обработки: ${processingTime}ms`);
      console.log(`${LOG_PREFIXES.INFO} Результат: ${result.success ? '✅' : '❌'} ${result.message}`);

      // Отправляем ответ
      const statusCode = result.success ? 200 : 400;
      const response = {
        success: result.success,
        message: result.message,
        submissionId: result.submissionId,
        createdAt: result.createdAt,
        errors: result.errors,
        processingTime: `${processingTime}ms`,
        timestamp: new Date().toISOString()
      };

      // Удаляем errors из ответа если успешно
      if (result.success) {
        delete response.errors;
      }

      return reply.code(statusCode).send(response);

    } catch (error) {
      console.error(`${LOG_PREFIXES.ERROR} Критическая ошибка при обработке формы:`, error);
      
      const processingTime = Date.now() - startTime;
      
      return reply.code(500).send({
        success: false,
        message: 'Внутренняя ошибка сервера',
        error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined,
        processingTime: `${processingTime}ms`,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Получает статистику по формам
   * GET /api/stats (опционально, для админки)
   */
  async getStats(request: FastifyRequest, reply: FastifyReply) {
    try {
      const stats = await this.formService.getStats();
      
      return reply.code(200).send({
        success: true,
        data: {
          ...stats,
          rateLimit: {
            ...stats.rateLimit,
            enabled: RATE_LIMIT_CONFIG.ENABLED
          },
          server: {
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error(`${LOG_PREFIXES.ERROR} Ошибка получения статистики:`, error);
      
      return reply.code(500).send({
        success: false,
        message: 'Не удалось получить статистику',
        timestamp: new Date().toISOString()
      });
    }
  }
}