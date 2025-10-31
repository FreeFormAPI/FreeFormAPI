import Fastify from 'fastify';

const fastify = Fastify({
  logger: true
});

// Health check эндпоинт
fastify.get('/health', async (request, reply) => {
  return { 
    status: 'OK', 
    service: 'FreeFormAPI', 
    version: '1.0.0',
    timestamp: new Date().toISOString() 
  };
});

// Основной эндпоинт для форм
fastify.post('/api/submit', async (request, reply) => {
  const formData = request.body;
  console.log('📨 Received form submission:', formData);
  
  return { 
    success: true, 
    message: 'Form received successfully!', 
    submissionId: 'sub-' + Date.now(),
    receivedAt: new Date().toISOString(),
    data: formData
  };
});

// Запуск сервера
const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('🚀 FreeFormAPI server running on http://localhost:3000');
    console.log('✅ Health check: http://localhost:3000/health');
  } catch (err) {
    console.error('❌ Server startup error:', err);
    process.exit(1);
  }
};

// Корневой эндпоинт
fastify.get('/', async (request, reply) => {
  return {
    message: 'Welcome to FreeFormAPI!',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      submit: 'POST /api/submit',
      docs: 'Coming soon...'
    }
  };
});

start();