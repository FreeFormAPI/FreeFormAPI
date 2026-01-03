// tests/unit/services/database.service.test.ts
import { DatabaseService } from '../../../src/services/database.service';
import { Pool } from 'pg';

// Создаем правильный мок для pg
jest.mock('pg', () => {
  const mClient = {
    connect: jest.fn(),
    query: jest.fn(),
    end: jest.fn()
  };
  
  const mPool = {
    connect: jest.fn(() => Promise.resolve(mClient)),
    query: jest.fn(),
    end: jest.fn(),
    on: jest.fn()
  };
  
  return { 
    Pool: jest.fn(() => mPool),
    Client: jest.fn(() => mClient)
  };
});

describe('DatabaseService', () => {
  let dbService: DatabaseService;
  let mockPool: jest.Mocked<Pool>;

  beforeEach(() => {
    // @ts-ignore - игнорируем проверку типов для мока
    mockPool = new (require('pg').Pool)() as jest.Mocked<Pool>;
    dbService = new DatabaseService(mockPool);
  });

  describe('saveFormSubmission', () => {
    it('should save form submission successfully', async () => {
      // Создаем тестовые данные в правильном формате
      const submissionData = {
        formId: 'test-form',
        email: 'test@example.com',
        message: 'Test message',
        ipAddress: '192.168.1.1',
        userAgent: 'Test Agent',
        isSpam: false
      };

      // Правильный мок результата запроса
      const mockQueryResult = {
        rows: [{ id: 1 }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: []
      };

      // Используем any для обхода проверки типов в моке
      (mockPool.query as jest.Mock).mockResolvedValue(mockQueryResult as any);

      // Вызываем метод
      const result = await dbService.saveFormSubmission(submissionData);

      // Проверяем результат
      expect(result.id).toBe(1);
      expect(mockPool.query).toHaveBeenCalled();
      
      // Проверяем что запрос содержит правильный SQL
      const queryCall = (mockPool.query as jest.Mock).mock.calls[0];
      expect(queryCall[0]).toContain('INSERT INTO form_submissions');
    });

    it('should handle database errors', async () => {
      const submissionData = {
        formId: 'test-form',
        email: 'test@example.com',
        message: 'Test message',
        ipAddress: '192.168.1.1',
        userAgent: 'Test Agent',
        isSpam: false
      };

      // Мокаем ошибку
      (mockPool.query as jest.Mock).mockRejectedValue(new Error('Database error'));

      // Ожидаем, что метод выбросит ошибку
      await expect(dbService.saveFormSubmission(submissionData))
        .rejects.toThrow();
    });
  });

  describe('getFormSubmission', () => {
    it('should return submission by id', async () => {
      const mockSubmission = {
        id: 1,
        form_id: 'test-form',
        email: 'test@example.com',
        message: 'Test message',
        ip_address: '192.168.1.1',
        user_agent: 'Test Agent',
        is_spam: false,
        status: 'pending',
        created_at: new Date().toISOString()
      };

      (mockPool.query as jest.Mock).mockResolvedValue({
        rows: [mockSubmission],
        rowCount: 1
      } as any);

      const result = await dbService.getFormSubmission(1);

      expect(result).toEqual(mockSubmission);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [1]
      );
    });

    it('should return null for non-existent submission', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({
        rows: [],
        rowCount: 0
      } as any);

      const result = await dbService.getFormSubmission(999);

      expect(result).toBeNull();
    });
  });
});