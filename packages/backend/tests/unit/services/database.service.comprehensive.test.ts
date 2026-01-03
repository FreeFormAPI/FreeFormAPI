// tests/unit/services/database.service.comprehensive.test.ts
import { DatabaseService } from '../../../src/services/database.service';

jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn()
  }))
}));

describe('DatabaseService Comprehensive', () => {
  let dbService: DatabaseService;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    const { Pool } = require('pg');
    const pool = new Pool();
    mockQuery = pool.query as jest.Mock;
    dbService = new DatabaseService(pool as any);
  });

  describe('saveFormSubmission', () => {
    it('should save valid submission', async () => {
      mockQuery.mockResolvedValue({ 
        rows: [{ id: 1, form_id: 'test', email: 'test@example.com' }] 
      });
      
      const result = await dbService.saveFormSubmission({
        formId: 'test',
        email: 'test@example.com',
        ipAddress: '192.168.1.1',
        userAgent: 'Test',
        isSpam: false
      });

      expect(result.id).toBe(1);
      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('saveSpamSubmission', () => {
    it('should save spam with metadata', async () => {
      mockQuery.mockResolvedValue({ 
        rows: [{ id: 2, is_spam: true, status: 'blocked' }] 
      });

      const result = await dbService.saveSpamSubmission(
        {
          formId: 'spam-form',
          email: 'spam@example.com',
          ipAddress: '1.2.3.4',
          userAgent: 'Bot',
          isSpam: true
        },
        'honeypot',
        { field: '_hp_test', value: 'filled' }
      );

      expect(result.id).toBe(2);
      expect(result.is_spam).toBe(true);
    });
  });

  describe('getFormSubmission', () => {
    it('should return submission by id', async () => {
      mockQuery.mockResolvedValue({ 
        rows: [{ id: 1, form_id: 'test', email: 'test@example.com' }] 
      });

      const submission = await dbService.getFormSubmission(1);
      expect(submission?.id).toBe(1);
    });

    it('should return null for non-existent', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const submission = await dbService.getFormSubmission(999);
      expect(submission).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      mockQuery.mockResolvedValue({ 
        rows: [{ 
          total: '10', 
          pending: '3', 
          processed: '5', 
          blocked: '2', 
          spam_count: '2', 
          last_24_hours: '4' 
        }] 
      });

      const stats = await dbService.getStats();
      
      expect(stats.total).toBe(10);
      expect(stats.spamCount).toBe(2);
      expect(stats.last24Hours).toBe(4);
    });
  });

  describe('getRecentSubmissions', () => {
    it('should return recent submissions', async () => {
      mockQuery.mockResolvedValue({ 
        rows: [
          { id: 1, form_id: 'test1' },
          { id: 2, form_id: 'test2' }
        ] 
      });

      const submissions = await dbService.getRecentSubmissions(5);
      expect(submissions).toHaveLength(2);
    });
  });

  describe('updateSubmissionStatus', () => {
    it('should update status', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await dbService.updateSubmissionStatus(1, 'approved');
      expect(result).toBe(true);
    });

    it('should return false on failure', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await dbService.updateSubmissionStatus(999, 'approved');
      expect(result).toBe(false);
    });
  });

  describe('deleteSubmission', () => {
    it('should delete submission', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await dbService.deleteSubmission(1);
      expect(result).toBe(true);
    });
  });

  describe('checkTableExists', () => {
    it('should check table existence', async () => {
      mockQuery.mockResolvedValue({ rows: [{ exists: true }] });

      const exists = await dbService.checkTableExists();
      expect(exists).toBe(true);
    });
  });

  describe('createTableIfNotExists', () => {
    it('should create table if not exists', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ exists: false }] }) // checkTableExists
        .mockResolvedValueOnce({}); // create table

      await dbService.createTableIfNotExists();
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should not create if exists', async () => {
      mockQuery.mockResolvedValue({ rows: [{ exists: true }] });

      await dbService.createTableIfNotExists();
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });
});