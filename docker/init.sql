-- FreeFormAPI Database Schema for PostgreSQL 18
-- Создаётся автоматически при первом запуске контейнера

-- Основная таблица для отправок форм
CREATE TABLE IF NOT EXISTS form_submissions (
    id BIGSERIAL PRIMARY KEY,
    
    -- Данные формы
    form_id VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    message TEXT,
    
    -- Метаданные запроса
    ip_address INET,
    user_agent TEXT,
    referer VARCHAR(500),
    
    -- Антиспам
    honeypot_field VARCHAR(50) DEFAULT '',
    is_spam BOOLEAN DEFAULT FALSE,
    spam_score INTEGER DEFAULT 0,
    
    -- Статус
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed', 'blocked')),
    processed_at TIMESTAMPTZ,
    
    -- Технические поля
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- Индексы для поиска
    CONSTRAINT valid_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_submissions_form_id ON form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON form_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_email ON form_submissions(email);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON form_submissions(status) WHERE status = 'pending';

-- Таблица для rate limiting по IP
CREATE TABLE IF NOT EXISTS rate_limits (
    ip_address INET PRIMARY KEY,
    submission_count INTEGER DEFAULT 0,
    last_submission TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_blocked BOOLEAN DEFAULT FALSE,
    blocked_until TIMESTAMPTZ,
    
    -- Автоматическое очищение старых записей
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Индекс для очистки старых записей (автоочистка через 24 часа)
CREATE INDEX IF NOT EXISTS idx_rate_limits_created ON rate_limits(created_at);

-- Таблица для логов (опционально, для отладки)
CREATE TABLE IF NOT EXISTS api_logs (
    id BIGSERIAL PRIMARY KEY,
    endpoint VARCHAR(100),
    method VARCHAR(10),
    ip_address INET,
    user_agent TEXT,
    request_body JSONB,
    response_status INTEGER,
    response_time INTEGER, -- в миллисекундах
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггер для автоматического обновления updated_at
CREATE TRIGGER update_form_submissions_updated_at 
    BEFORE UPDATE ON form_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Тестовые данные (опционально, для разработки)
INSERT INTO form_submissions (form_id, email, message, status) 
VALUES 
    ('contact_form', 'test@example.com', 'Это тестовое сообщение', 'processed'),
    ('newsletter_form', 'user@domain.com', 'Хочу подписаться на рассылку', 'pending')
ON CONFLICT DO NOTHING;

-- Вывод информации о созданных таблицах
DO $$
BEGIN
    RAISE NOTICE '✅ FreeFormAPI database initialized successfully';
    RAISE NOTICE '📊 Tables created: form_submissions, rate_limits, api_logs';
END $$;