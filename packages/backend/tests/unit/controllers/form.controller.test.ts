// tests/unit/controllers/form.controller.test.ts
import { FormController } from '../../../src/controllers/form.controller';

describe('FormController', () => {
  let formController: FormController;
  let mockFormService: any;
  let mockSessionService: any;
  let mockDatabaseService: any;

  beforeEach(() => {
    mockFormService = {
      submitForm: jest.fn(),
      getStats: jest.fn()
    };
    
    mockSessionService = {};
    mockDatabaseService = {};

    formController = new FormController(
      mockFormService, 
      mockSessionService, 
      mockDatabaseService
    );
  });

  describe('submit', () => {
    it('should process valid form', async () => {
      const mockRequest = {
        body: { formId: 'test', email: 'test@example.com', _sessionId: '123' },
        ip: '192.168.1.1',
        headers: { 'user-agent': 'Test' },
        method: 'POST',
        url: '/api/submit'
      } as any;

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      mockFormService.submitForm.mockResolvedValue({
        success: true,
        message: 'Form submitted',
        submissionId: 1,
        createdAt: new Date().toISOString()
      });

      await formController.submit(mockRequest, mockReply);

      expect(mockFormService.submitForm).toHaveBeenCalledWith(
        mockRequest.body,
        '192.168.1.1',
        'Test'
      );
      expect(mockReply.code).toHaveBeenCalledWith(200);
    });

    it('should handle invalid request body', async () => {
      const mockRequest = {
        body: null,
        ip: '192.168.1.1',
        headers: {},
        method: 'POST',
        url: '/api/submit'
      } as any;

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await formController.submit(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      const mockRequest = {} as any;
      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      mockFormService.getStats.mockResolvedValue({
        total: 10,
        pending: 3,
        processed: 5,
        blocked: 2,
        spamCount: 2,
        last24Hours: 4
      });

      await formController.getStats(mockRequest, mockReply);

      expect(mockFormService.getStats).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(200);
    });
  });
});