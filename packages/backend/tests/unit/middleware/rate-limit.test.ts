// tests/unit/middleware/rate-limit.test.ts
import { createRateLimitMiddleware, RateLimitMiddleware } from '../../../src/middleware/rate-limit';
import Redis from 'ioredis';

jest.mock('ioredis');

describe('RateLimit Middleware', () => {
    let mockRedis: jest.Mocked<Redis>;
    let rateLimitMiddleware: RateLimitMiddleware;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockRedis = {
            incr: jest.fn(),
            expire: jest.fn(),
            get: jest.fn(),
            ttl: jest.fn(),
            del: jest.fn(),
            multi: jest.fn(() => ({
                incr: jest.fn().mockReturnThis(),
                ttl: jest.fn().mockReturnThis(),
                exec: jest.fn()
            }))
        } as any;

        rateLimitMiddleware = createRateLimitMiddleware(mockRedis);
    });

    describe('middleware()', () => {
        let mockRequest: any;
        let mockReply: any;

        beforeEach(() => {
            mockRequest = {
                ip: '192.168.1.1',
                headers: { 'user-agent': 'TestAgent' },
                url: '/api/submit',
                method: 'POST'
            };

            mockReply = {
                code: jest.fn().mockReturnThis(),
                send: jest.fn().mockReturnThis(),
                header: jest.fn().mockReturnThis()
            };
        });

        it('should allow request when under limit', async () => {
            // Arrange
            const mockMulti = {
                incr: jest.fn().mockReturnThis(),
                ttl: jest.fn().mockReturnThis(),
                exec: jest.fn().mockResolvedValue([
                    [null, 50], // incr result
                    [null, 3600] // ttl result
                ])
            };
            mockRedis.multi.mockReturnValue(mockMulti as any);

            // Act
            const middleware = rateLimitMiddleware.middleware();
            await middleware(mockRequest, mockReply);

            // Assert
            expect(mockRedis.multi).toHaveBeenCalled();
            expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
        });

        it('should block request when over limit', async () => {
            // Arrange
            const mockMulti = {
                incr: jest.fn().mockReturnThis(),
                ttl: jest.fn().mockReturnThis(),
                exec: jest.fn().mockResolvedValue([
                    [null, 101], // Превышен лимит
                    [null, 1800]
                ])
            };
            mockRedis.multi.mockReturnValue(mockMulti as any);

            // Act & Assert
            const middleware = rateLimitMiddleware.middleware();
            
            await expect(middleware(mockRequest, mockReply))
                .rejects
                .toThrow('RATE_LIMIT_EXCEEDED');

            expect(mockReply.code).toHaveBeenCalledWith(429);
            expect(mockReply.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    success: false,
                    message: expect.stringContaining('Слишком много запросов с вашего IP-адреса')
                })
            );
        });

        it('should handle Redis errors gracefully', async () => {
            // Arrange
            mockRedis.multi.mockImplementation(() => {
                throw new Error('Redis недоступен');
            });

            // Act
            const middleware = rateLimitMiddleware.middleware();
            
            // Должен выполниться без ошибок (пропускаем rate limiting)
            await expect(middleware(mockRequest, mockReply)).resolves.not.toThrow();
        });

        it('should set TTL on first request', async () => {
            // Arrange
            const mockMulti = {
                incr: jest.fn().mockReturnThis(),
                ttl: jest.fn().mockReturnThis(),
                exec: jest.fn().mockResolvedValue([
                    [null, 1], // Первый запрос
                    [null, -1] // TTL еще не установлен
                ])
            };
            mockRedis.multi.mockReturnValue(mockMulti as any);

            // Act
            const middleware = rateLimitMiddleware.middleware();
            await middleware(mockRequest, mockReply);

            // Assert
            expect(mockRedis.expire).toHaveBeenCalledWith(
                'rate_limit:192.168.1.1',
                3600 // 1 час в секундах (3600000ms / 1000)
            );
        });
    });

    describe('getLimitInfo()', () => {
        it('should return limit information', async () => {
            // Arrange
            mockRedis.get.mockResolvedValue('75');
            mockRedis.ttl.mockResolvedValue(1800);

            // Act
            const info = await rateLimitMiddleware.getLimitInfo('192.168.1.1');

            // Assert
            expect(info.current).toBe(75);
            expect(info.remaining).toBe(25); // 100 - 75
            expect(info.limit).toBe(100);
            expect(info.resetIn).toBe(1800);
            expect(info.isBlocked).toBe(false);
        });

        it('should return default values when no data in Redis', async () => {
            // Arrange
            mockRedis.get.mockResolvedValue(null);
            mockRedis.ttl.mockResolvedValue(-2);

            // Act
            const info = await rateLimitMiddleware.getLimitInfo('192.168.1.1');

            // Assert
            expect(info.current).toBe(0);
            expect(info.remaining).toBe(100);
            expect(info.isBlocked).toBe(false);
        });

        it('should handle Redis errors in getLimitInfo', async () => {
            // Arrange
            mockRedis.get.mockRejectedValue(new Error('Redis error'));

            // Act
            const info = await rateLimitMiddleware.getLimitInfo('192.168.1.1');

            // Assert
            expect(info.current).toBe(0);
            expect(info.remaining).toBe(100);
        });
    });

    describe('resetLimit()', () => {
        it('should reset limit for IP', async () => {
            // Arrange
            mockRedis.del.mockResolvedValue(1);

            // Act
            const result = await rateLimitMiddleware.resetLimit('192.168.1.1');

            // Assert
            expect(result).toBe(true);
            expect(mockRedis.del).toHaveBeenCalledWith('rate_limit:192.168.1.1');
        });

        it('should handle Redis errors in resetLimit', async () => {
            // Arrange
            mockRedis.del.mockRejectedValue(new Error('Redis error'));

            // Act
            const result = await rateLimitMiddleware.resetLimit('192.168.1.1');

            // Assert
            expect(result).toBe(false);
        });
    });
});