describe('Jest Working Test', () => {
  test('should pass', () => {
    console.log('Jest работает!');
    expect(1 + 1).toBe(2);
  });
  
  test('should find session service', () => {
    const fs = require('fs');
    const path = require('path');
    
    const sessionServicePath = path.join(__dirname, 'src/services/session.service.ts');
    const exists = fs.existsSync(sessionServicePath);
    
    console.log('Session service exists:', exists);
    expect(exists).toBe(true);
  });
});
