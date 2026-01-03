// tests/unit/services/session.service.test.ts
import Redis from 'ioredis';
import { SessionService } from '../../../src/services/session.service';

// Мок для Redis
jest.mock('ioredis', () => {
  const mRedis = {
    setex: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    expire: jest.fn(),
    keys: jest.fn()
  };
  return jest.fn(() => mRedis);
});

// Мок для crypto утилит
jest.mock('../../../src/utils/crypto', () => ({
  generateSessionId: jest.fn().mockReturnValue('test-session-id-123'),
  generateHoneypotFieldName: jest.fn().mockReturnValue('_hp_test12345')
}));

// Мок для config
jest.mock('../../../src/config', () => ({
  SESSION_CONFIG: {
    PREFIX: 'session:',
    TTL: 600,
    MAX_ATTEMPTS: 5
  }
}));

describe('SessionService', () => {
  let sessionService: SessionService;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = new Redis() as jest.Mocked<Redis>;
    sessionService = new SessionService(mockRedis);
  });

  describe('createSession', () => {
    it('should create a new session without parameters', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      const result = await sessionService.createSession();

      expect(result).toEqual({
        sessionId: 'test-session-id-123',
        honeypotField: '_hp_test12345',
        expiresIn: 600,
        createdAt: expect.any(String)
      });

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'session:test-session-id-123',
        600,
        expect.any(String)
      );
    });

    it('should throw error when Redis fails', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));

      await expect(sessionService.createSession())
        .rejects.toThrow('Не удалось создать сессию');
    });
  });

  describe('getSession', () => {
    it('should return session data when exists', async () => {
      const sessionData = {
        honeypotField: '_hp_test123',
        createdAt: Date.now(),
        used: false,
        attempts: 0
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(sessionData));
      mockRedis.setex.mockResolvedValue('OK');

      const result = await sessionService.getSession('test-session');

      expect(result).toEqual({
        ...sessionData,
        lastAccess: expect.any(Number)
      });
      expect(mockRedis.get).toHaveBeenCalledWith('session:test-session');
    });

    it('should return null when session not found', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await sessionService.getSession('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('markSessionAsUsed', () => {
    it('should mark session as used', async () => {
      const sessionData = {
        honeypotField: '_hp_test123',
        createdAt: Date.now(),
        used: false,
        attempts: 0
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(sessionData));
      mockRedis.setex.mockResolvedValue('OK');

      await sessionService.markSessionAsUsed('test-session', '192.168.1.1', 'Test Agent');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'session:test-session',
        300,
        expect.stringContaining('"used":true')
      );
    });

    it('should not fail when session not found', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(
        sessionService.markSessionAsUsed('non-existent', '192.168.1.1', 'Agent')
      ).resolves.not.toThrow();
    });
  });

  describe('incrementAttempts', () => {
    it('should increment attempts counter', async () => {
      const sessionData = {
        honeypotField: '_hp_test123',
        createdAt: Date.now(),
        used: false,
        attempts: 2
      };

      mockRedis.get.mockResolvedValue(JSON.stringify(sessionData));
      mockRedis.setex.mockResolvedValue('OK');

      await sessionService.incrementAttempts('test-session');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'session:test-session',
        600,
        expect.stringContaining('"attempts":3')
      );
    });
  });

  describe('checkHoneypotSpam', () => {
    it('should return true when current honeypot is filled', () => {
      const session = {
        honeypotField: '_hp_current',
        createdAt: Date.now(),
        used: false,
        attempts: 0
      };

      const body = {
        formId: 'test',
        email: 'test@example.com',
        '_hp_current': 'bot-filled-value'
      };

      const isSpam = sessionService.checkHoneypotSpam(body, session);

      expect(isSpam).toBe(true);
    });

    it('should return true when old honeypot is filled', () => {
      const session = {
        honeypotField: '_hp_current',
        createdAt: Date.now(),
        used: false,
        attempts: 0
      };

      const body = {
        formId: 'test',
        email: 'test@example.com',
        '_hp_current': '',
        '_hp_oldfield': 'bot-filled'
      };

      const isSpam = sessionService.checkHoneypotSpam(body, session);

      expect(isSpam).toBe(true);
    });

    it('should return false when no honeypot is filled', () => {
      const session = {
        honeypotField: '_hp_current',
        createdAt: Date.now(),
        used: false,
        attempts: 0
      };

      const body = {
        formId: 'test',
        email: 'test@example.com',
        '_hp_current': '',
        '_hp_oldfield': ''
      };

      const isSpam = sessionService.checkHoneypotSpam(body, session);

      expect(isSpam).toBe(false);
    });
  });

  describe('validateSession', () => {
    it('should return valid for correct session', () => {
      const session = {
        honeypotField: '_hp_test',
        createdAt: Date.now(),
        used: false,
        attempts: 0
      };

      const result = sessionService.validateSession('test-session', session);

      expect(result.valid).toBe(true);
    });

    it('should return invalid for missing session', () => {
      const result = sessionService.validateSession('test-session', null);

      expect(result.valid).toBe(false);
      expect(result.message).toContain('Недействительная');
    });

    it('should return invalid for used session', () => {
      const session = {
        honeypotField: '_hp_test',
        createdAt: Date.now(),
        used: true,
        attempts: 0
      };

      const result = sessionService.validateSession('test-session', session);

      expect(result.valid).toBe(false);
      expect(result.message).toContain('уже была отправлена');
    });

    it('should return invalid for too many attempts', () => {
      const session = {
        honeypotField: '_hp_test',
        createdAt: Date.now(),
        used: false,
        attempts: 10
      };

      const result = sessionService.validateSession('test-session', session);

      expect(result.valid).toBe(false);
      expect(result.message).toContain('Превышено максимальное');
    });
  });

  describe('deleteSession', () => {
    it('should delete session successfully', async () => {
      mockRedis.del.mockResolvedValue(1);

      await sessionService.deleteSession('test-session');

      expect(mockRedis.del).toHaveBeenCalledWith('session:test-session');
    });
  });

  describe('getStats', () => {
    it('should return session statistics', async () => {
      mockRedis.keys.mockResolvedValue(['session:1', 'session:2', 'session:3']);

      const stats = await sessionService.getStats();

      expect(stats).toEqual({ activeSessions: 3 });
    });

    it('should return 0 on Redis error', async () => {
      mockRedis.keys.mockRejectedValue(new Error('Redis error'));

      const stats = await sessionService.getStats();

      expect(stats).toEqual({ activeSessions: 0 });
    });
  });
});