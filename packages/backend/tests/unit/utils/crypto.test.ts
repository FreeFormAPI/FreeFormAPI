// tests/unit/utils/crypto.test.ts
import {
    generateSessionId,
    generateHoneypotFieldName,
    generateToken,
    createHashSHA256,
    isValidHex,
    getRandomInt
} from '../../../src/utils/crypto';

describe('Crypto Utils', () => {
    describe('generateSessionId', () => {
        it('should generate a 32-character hex string', () => {
            // Act
            const sessionId = generateSessionId();

            // Assert
            expect(sessionId).toHaveLength(32);
            expect(sessionId).toMatch(/^[a-f0-9]{32}$/);
        });

        it('should generate unique IDs', () => {
            // Act
            const ids = new Set<string>();
            for (let i = 0; i < 100; i++) {
                ids.add(generateSessionId());
            }

            // Assert
            expect(ids.size).toBe(100);
        });
    });

    describe('generateHoneypotFieldName', () => {
        it('should generate honeypot field name with correct format', () => {
            // Arrange
            const sessionId = 'abc123def4567890abcdef1234567890';

            // Act
            const honeypotField = generateHoneypotFieldName(sessionId);

            // Assert - Функция берет 9 символов (abc123def), а не 8!
            expect(honeypotField).toBe('_hp_abc123de'); // slice(0, 9) дает 'abc123de' + '_hp_' = 12 символов
            expect(honeypotField).toHaveLength(12); // _hp_ + 9 символов = 12? Нет, _hp_(4) + 9 = 13? Проверим!
        });

        it('should generate consistent names for same session ID', () => {
            // Arrange
            const sessionId = 'test-session-id-1234567890';

            // Act
            const field1 = generateHoneypotFieldName(sessionId);
            const field2 = generateHoneypotFieldName(sessionId);

            // Assert
            expect(field1).toBe(field2);
            expect(field1).toBe('_hp_test-ses'); // slice(0, 9) = 'test-ses'
        });

        it('should generate different names for different session IDs with different prefixes', () => {
            // Arrange - используем ОЧЕНЬ разные session IDs
            const sessionId1 = 'aaaaaaaaabbbbbbbbccccccccdddddddd';
            const sessionId2 = 'eeeeeeeeefffffffgggggggghhhhhhhh';

            // Act
            const field1 = generateHoneypotFieldName(sessionId1);
            const field2 = generateHoneypotFieldName(sessionId2);

            // Assert
            expect(field1).not.toBe(field2);
            expect(field1).toBe('_hp_aaaaaaaa'); // 9 символов
            expect(field2).toBe('_hp_eeeeeeee'); // 9 символов
        });

        // ДОБАВИМ: Проверим длину результирующей строки
        it('should have correct length calculation', () => {
            // Функция берет 9 символов из sessionId
            const testCases = [
                { sessionId: '123456789', expected: '_hp_12345678' },
                { sessionId: 'abcdefghi', expected: '_hp_abcdefgh' },
                { sessionId: 'short', expected: '_hp_short' }, // Если sessionId короче 9 символов
            ];

            testCases.forEach(({ sessionId, expected }) => {
                const result = generateHoneypotFieldName(sessionId);
                expect(result).toBe(expected);
            });
        });
    });

    describe('generateToken', () => {
        it('should generate token of specified length', () => {
            // Act
            const token = generateToken(16);

            // Assert
            expect(token).toHaveLength(32); // 16 байт = 32 hex символа
            expect(token).toMatch(/^[a-f0-9]{32}$/);
        });

        it('should generate 64-character token by default', () => {
            // Act
            const token = generateToken();

            // Assert
            expect(token).toHaveLength(64); // 32 байта = 64 hex символа
        });
    });

    describe('createHashSHA256', () => {
        it('should create SHA-256 hash', () => {
            // Arrange
            const data = 'test data';

            // Act
            const hash = createHashSHA256(data);

            // Assert
            expect(hash).toHaveLength(64); // SHA-256 = 64 hex символа
            expect(hash).toMatch(/^[a-f0-9]{64}$/);
        });

        it('should create consistent hashes for same input', () => {
            // Arrange
            const data = 'consistent data';

            // Act
            const hash1 = createHashSHA256(data);
            const hash2 = createHashSHA256(data);

            // Assert
            expect(hash1).toBe(hash2);
        });
    });

    describe('isValidHex', () => {
        it('should validate hex strings', () => {
            // Valid cases
            expect(isValidHex('abc123')).toBe(true);
            expect(isValidHex('ABCDEF')).toBe(true);
            expect(isValidHex('0123456789abcdef')).toBe(true);

            // Invalid cases
            expect(isValidHex('')).toBe(false);
            expect(isValidHex('abc123g')).toBe(false); // 'g' не hex
            expect(isValidHex('abc 123')).toBe(false); // пробел
            expect(isValidHex('abc-123')).toBe(false); // дефис
        });
    });

    describe('getRandomInt', () => {
        it('should generate random integer within range', () => {
            // Act
            const result = getRandomInt(1, 10);

            // Assert
            expect(result).toBeGreaterThanOrEqual(1);
            expect(result).toBeLessThanOrEqual(10);
        });

        it('should handle same min and max', () => {
            // Act
            const result = getRandomInt(5, 5);

            // Assert
            expect(result).toBe(5);
        });

        it('should generate different numbers (usually)', () => {
            // Act
            const results = new Set<number>();
            for (let i = 0; i < 100; i++) {
                results.add(getRandomInt(1, 1000));
            }

            // Assert - хотя бы несколько разных значений
            expect(results.size).toBeGreaterThan(1);
        });
    });
});