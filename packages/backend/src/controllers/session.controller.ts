/**
 * Контроллер управления сессиями для FreeFormAPI
 * HTTP обработчик для эндпоинта /api/session
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { SessionService } from '../services/session.service';
import { LOG_PREFIXES } from '../config/constants';
import { SESSION_CONFIG } from '../config';

export class SessionController {
    constructor(private sessionService: SessionService) { }

    /**
     * Создает новую сессию
     * GET /api/session
     */
    async create(request: FastifyRequest, reply: FastifyReply) {
        console.log(`\n${LOG_PREFIXES.SERVER} === СОЗДАНИЕ НОВОЙ СЕССИИ ===`);
        console.log(`${LOG_PREFIXES.INFO} IP: ${request.ip}`);
        console.log(`${LOG_PREFIXES.INFO} User-Agent: ${request.headers['user-agent'] || 'unknown'}`);

        try {
            // Создаем новую сессию
            const session = await this.sessionService.createSession();

            console.log(`${LOG_PREFIXES.SUCCESS} Сессия создана: ${session.sessionId}`);
            console.log(`${LOG_PREFIXES.DEBUG} Honeypot поле: ${session.honeypotField}`);

            return reply.code(200).send({
                success: true,
                data: session,
                message: 'Сессия успешно создана',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error(`${LOG_PREFIXES.ERROR} Ошибка создания сессии:`, error);

            return reply.code(500).send({
                success: false,
                message: 'Не удалось создать сессию. Пожалуйста, попробуйте позже.',
                error: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Проверяет валидность сессии
     * GET /api/session/:sessionId/validate
     */
    async validate(request: FastifyRequest, reply: FastifyReply) {
        const params = request.params as { sessionId: string };
        const sessionId = params.sessionId;

        console.log(`${LOG_PREFIXES.DEBUG} Проверка сессии: ${sessionId}`);

        if (!sessionId) {
            return reply.code(400).send({
                success: false,
                message: 'ID сессии обязателен',
                timestamp: new Date().toISOString()
            });
        }

        try {
            const session = await this.sessionService.getSession(sessionId);
            const validation = this.sessionService.validateSession(sessionId, session);

            const responseData: any = {
                sessionId,
                isValid: validation.valid,
                isUsed: session?.used || false,
                attempts: session?.attempts || 0,
                honeypotField: session?.honeypotField || ''
            };

            // Добавляем errorCode только если есть ошибка
            if (!validation.valid && validation.code) {
                responseData.errorCode = validation.code;
            }

            const response = {
                success: validation.valid,
                data: responseData,
                message: validation.valid ? 'Сессия действительна' : validation.message,
                timestamp: new Date().toISOString()
            };

            const statusCode = validation.valid ? 200 : 400;
            return reply.code(statusCode).send(response);

        } catch (error) {
            console.error(`${LOG_PREFIXES.ERROR} Ошибка проверки сессии:`, error);

            return reply.code(500).send({
                success: false,
                message: 'Ошибка проверки сессии',
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Получает информацию о сессии
     * GET /api/session/:sessionId
     */
    async get(request: FastifyRequest, reply: FastifyReply) {
        const params = request.params as { sessionId: string };
        const sessionId = params.sessionId;

        console.log(`${LOG_PREFIXES.DEBUG} Получение информации о сессии: ${sessionId}`);

        if (!sessionId) {
            return reply.code(400).send({
                success: false,
                message: 'ID сессии обязателен',
                timestamp: new Date().toISOString()
            });
        }

        try {
            const session = await this.sessionService.getSession(sessionId);

            if (!session) {
                return reply.code(404).send({
                    success: false,
                    message: 'Сессия не найдена или истекла',
                    timestamp: new Date().toISOString()
                });
            }

            // Не раскрываем чувствительную информацию
            const safeSession = {
                sessionId,
                honeypotField: session.honeypotField,
                createdAt: new Date(session.createdAt).toISOString(),
                lastAccess: session.lastAccess ? new Date(session.lastAccess).toISOString() : null,
                used: session.used,
                attempts: session.attempts,
                expiresIn: SESSION_CONFIG.TTL - Math.floor((Date.now() - session.createdAt) / 1000)
            };

            return reply.code(200).send({
                success: true,
                data: safeSession,
                message: 'Информация о сессии получена',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error(`${LOG_PREFIXES.ERROR} Ошибка получения сессии:`, error);

            return reply.code(500).send({
                success: false,
                message: 'Ошибка получения информации о сессии',
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Удаляет сессию
     * DELETE /api/session/:sessionId
     */
    async delete(request: FastifyRequest, reply: FastifyReply) {
        const params = request.params as { sessionId: string };
        const sessionId = params.sessionId;

        console.log(`${LOG_PREFIXES.DEBUG} Удаление сессии: ${sessionId}`);

        if (!sessionId) {
            return reply.code(400).send({
                success: false,
                message: 'ID сессии обязателен',
                timestamp: new Date().toISOString()
            });
        }

        try {
            await this.sessionService.deleteSession(sessionId);

            return reply.code(200).send({
                success: true,
                message: 'Сессия удалена',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error(`${LOG_PREFIXES.ERROR} Ошибка удаления сессии:`, error);

            return reply.code(500).send({
                success: false,
                message: 'Ошибка удаления сессии',
                timestamp: new Date().toISOString()
            });
        }
    }
}