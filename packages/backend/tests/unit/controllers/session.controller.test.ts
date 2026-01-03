// tests/unit/controllers/session.controller.test.ts
import { SessionController } from '../../../src/controllers/session.controller';

describe('SessionController', () => {
  let sessionController: SessionController;
  let mockSessionService: any;

  beforeEach(() => {
    mockSessionService = {
      createSession: jest.fn(),
      getSession: jest.fn(),
      deleteSession: jest.fn(),
      validateSession: jest.fn()
    };

    sessionController = new SessionController(mockSessionService);
  });

  describe('create', () => {
    it('should create new session', async () => {
      const mockRequest = {
        ip: '192.168.1.1',
        headers: { 'user-agent': 'Test Agent' }
      } as any;

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      mockSessionService.createSession.mockResolvedValue({
        sessionId: 'test-123',
        honeypotField: '_hp_test',
        expiresIn: 600,
        createdAt: new Date().toISOString()
      });

      await sessionController.create(mockRequest, mockReply);

      expect(mockSessionService.createSession).toHaveBeenCalled();
      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ 
          success: true,
          data: expect.objectContaining({ sessionId: 'test-123' })
        })
      );
    });
  });

  describe('validate', () => {
    it('should validate session', async () => {
      const mockRequest = {
        params: { sessionId: 'test-session' }
      } as any;

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      const mockSession = {
        honeypotField: '_hp_test',
        createdAt: Date.now(),
        used: false,
        attempts: 0
      };

      mockSessionService.getSession.mockResolvedValue(mockSession);
      mockSessionService.validateSession.mockReturnValue({ 
        valid: true 
      });

      await sessionController.validate(mockRequest, mockReply);

      expect(mockSessionService.getSession).toHaveBeenCalledWith('test-session');
      expect(mockReply.code).toHaveBeenCalledWith(200);
    });
  });

  describe('get', () => {
    it('should get session info', async () => {
      const mockRequest = {
        params: { sessionId: 'test-session' }
      } as any;

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      mockSessionService.getSession.mockResolvedValue({
        honeypotField: '_hp_test',
        createdAt: Date.now(),
        used: false,
        attempts: 0
      });

      await sessionController.get(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('delete', () => {
    it('should delete session', async () => {
      const mockRequest = {
        params: { sessionId: 'test-session' }
      } as any;

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as any;

      await sessionController.delete(mockRequest, mockReply);

      expect(mockSessionService.deleteSession).toHaveBeenCalledWith('test-session');
      expect(mockReply.code).toHaveBeenCalledWith(200);
    });
  });
});