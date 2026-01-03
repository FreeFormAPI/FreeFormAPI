// tests/unit/validation/form.validator.test.ts
import { 
  validateFormData, 
  validateEmail, 
  validateFormId, 
  validateMessage, 
  validateSessionId,
  validateHoneypot 
} from '../../../src/validation/form.validator';

describe('FormValidator', () => {
  describe('validateFormData', () => {
    it('should validate correct form data', () => {
      const formData = {
        formId: 'contact-form',
        email: 'test@example.com',
        message: 'Hello World',
        _sessionId: 'session-123',
        '_hp_12345678': '' // Пустое honeypot поле
      };

      const result = validateFormData(formData, '_hp_12345678');
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should reject invalid email', () => {
      const formData = {
        formId: 'contact-form',
        email: 'not-an-email',
        message: 'Hello World',
        _sessionId: 'session-123',
        '_hp_12345678': ''
      };

      const result = validateFormData(formData, '_hp_12345678');
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].field).toBe('email');
    });

    it('should detect filled honeypot field', () => {
      const formData = {
        formId: 'contact-form',
        email: 'test@example.com',
        message: 'Hello World',
        _sessionId: 'session-123',
        '_hp_12345678': 'bot-filled-value' // Заполненное honeypot поле
      };

      const result = validateFormData(formData, '_hp_12345678');
      
      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('validateEmail', () => {
    it('should return true for valid email', () => {
      expect(validateEmail('test@example.com')).toBe(true);
    });

    it('should return false for invalid email', () => {
      expect(validateEmail('not-an-email')).toBe(false);
    });
  });

  describe('validateHoneypot', () => {
    it('should return valid for empty honeypot', () => {
      const data = {
        '_hp_12345678': ''
      };
      
      const result = validateHoneypot(data, '_hp_12345678');
      expect(result.isValid).toBe(true);
    });

    it('should return invalid for filled honeypot', () => {
      const data = {
        '_hp_12345678': 'bot-value'
      };
      
      const result = validateHoneypot(data, '_hp_12345678');
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('honeypot');
    });
  });
});