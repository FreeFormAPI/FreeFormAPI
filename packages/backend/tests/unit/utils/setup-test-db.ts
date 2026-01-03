// tests/utils/setup-test-db.ts
import { Client } from 'pg';

const TEST_DB_NAME = 'freeformapi_test';

export async function setupTestDatabase() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: 'postgres'
  });

  try {
    await client.connect();
    
    // Удаляем старую тестовую БД если существует
    await client.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    
    // Создаем новую тестовую БД
    await client.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    
    console.log(`✅ Тестовая БД ${TEST_DB_NAME} создана`);
  } catch (error) {
    console.error('❌ Ошибка создания тестовой БД:', error);
    throw error;
  } finally {
    await client.end();
  }
}

export async function createTestTables() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    
    // Создаем таблицу form_submissions
    await client.query(`
      CREATE TABLE IF NOT EXISTS form_submissions (
        id SERIAL PRIMARY KEY,
        form_id VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL,
        message TEXT,
        ip_address VARCHAR(45) NOT NULL,
        user_agent TEXT NOT NULL,
        is_spam BOOLEAN DEFAULT false,
        status VARCHAR(20) DEFAULT 'pending',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Создаем индекс для поиска
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_form_submissions_form_id 
      ON form_submissions(form_id)
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_form_submissions_created_at 
      ON form_submissions(created_at)
    `);
    
    console.log('✅ Тестовые таблицы созданы');
  } catch (error) {
    console.error('❌ Ошибка создания таблиц:', error);
    throw error;
  } finally {
    await client.end();
  }
}

export async function cleanupTestDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    
    // Очищаем таблицы
    await client.query('TRUNCATE TABLE form_submissions RESTART IDENTITY CASCADE');
    
    console.log('✅ Тестовая БД очищена');
  } catch (error) {
    console.error('❌ Ошибка очистки БД:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Запуск из командной строки
if (require.main === module) {
  setupTestDatabase()
    .then(() => createTestTables())
    .then(() => {
      console.log('✅ Настройка тестовой БД завершена');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Ошибка настройки тестовой БД:', error);
      process.exit(1);
    });
}