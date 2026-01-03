/**
 * FreeFormAPI Widget v1.0.0
 * JavaScript виджет для встраивания форм на сайты
 * 
 * Использование:
 * 1. Подключите скрипт: <script src="https://freeformapi.ru/widget.js"></script>
 * 2. Добавьте атрибут data-freeform к форме: <form data-freeform="form-id">
 */

(function () {
    'use strict';

    // Конфигурация по умолчанию
    const DEFAULT_CONFIG = {
        apiUrl: 'http://localhost:3000/api/submit',
        formSelector: '[data-freeform]',
        successMessage: '✅ Форма успешно отправлена!',
        errorMessage: '❌ Ошибка отправки. Попробуйте позже.',
        honeypotField: '_honeypot'
    };

    // ====================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ======================
    let activeWidgetInstance = null;
    let isInitializing = false;
    let initQueue = [];

    /**
     * Основной класс виджета FreeFormAPI
     * Управляет инициализацией форм, сессиями и отправкой данных
     */
    class FreeFormWidget {
        /**
         * Создаёт экземпляр виджета с конфигурацией
         * @param {Object} config - Пользовательская конфигурация (необязательно)
         */
        constructor(config = {}) {
            this.config = { ...DEFAULT_CONFIG, ...config };
            this.forms = [];
            this.session = null;
            this.initialized = false;
        }

        /**
         * Инициализирует виджет: получает сессию, находит и настраивает формы
         * @async
         * @throws {Error} При ошибке получения сессии или настройки форм
         */
        async init() {
            if (this.initialized) return;

            try {
                // 1. ПОЛУЧИТЬ СЕССИЮ
                await this.loadOrCreateSession();

                if (!this.session) {
                    throw new Error('Failed to get session');
                }

                // 2. НАЙТИ ФОРМЫ
                this.forms = Array.from(document.querySelectorAll(this.config.formSelector));

                if (this.forms.length === 0) {
                    console.warn('FreeFormAPI: no forms found');
                    return;
                }

                console.log(`🔍 Found ${this.forms.length} forms`);

                // 3. НАСТРОИТЬ ФОРМЫ
                this.forms.forEach(form => {
                    this.setupForm(form);
                });

                this.initialized = true;
                console.log(`✅ FreeFormAPI Widget initialized, session: ${this.session.sessionId}`);

            } catch (error) {
                this.handleInitError(error);
            }
        }

        /**
         * Загружает сессию из localStorage или создаёт новую
         * @async
         */
        async loadOrCreateSession() {
            const storageKey = 'freeformapi_session';

            // Пробуем загрузить из localStorage
            const stored = this.loadSessionFromStorage(storageKey);
            if (stored) {
                this.session = stored;
                return;
            }

            // Если нет - запрашиваем с сервера
            this.session = await this.fetchNewSession();
            this.saveSessionToStorage(storageKey, this.session);
        }

        /**
         * Загружает сессию из localStorage с проверкой срока действия
         * @param {string} key - Ключ в localStorage
         * @returns {Object|null} Данные сессии или null
         */
        loadSessionFromStorage(key) {
            try {
                const stored = localStorage.getItem(key);
                if (!stored) return null;

                const session = JSON.parse(stored);
                const sessionAge = Date.now() - new Date(session.createdAt).getTime();

                // Сессия действительна 9 минут
                if (sessionAge < 9 * 60 * 1000) {
                    console.log('✅ Using stored session:', session.sessionId);
                    return session;
                } else {
                    localStorage.removeItem(key);
                    return null;
                }
            } catch (error) {
                localStorage.removeItem(key);
                return null;
            }
        }

        /**
         * Запрашивает новую сессию с сервера
         * @async
         * @returns {Promise<Object>} Данные новой сессии
         * @throws {Error} При ошибке HTTP или создания сессии
         */
        async fetchNewSession() {
            console.log('🔄 Requesting new session...');
            const response = await fetch(`${this.config.apiUrl.replace('/submit', '')}/session`);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error('Session creation failed: ' + (data.message || 'Unknown error'));
            }

            console.log('✅ New session acquired:', data.data.sessionId);
            return data.data;
        }

        /**
         * Сохраняет сессию в localStorage
         * @param {string} key - Ключ для сохранения
         * @param {Object} session - Данные сессии
         */
        saveSessionToStorage(key, session) {
            try {
                localStorage.setItem(key, JSON.stringify(session));
            } catch (error) {
                console.warn('⚠️ Could not save session to localStorage:', error);
            }
        }

        /**
         * Настраивает отдельную форму: добавляет honeypot поле и обработчик отправки
         * @param {HTMLFormElement} form - DOM элемент формы
         */
        setupForm(form) {
            if (!this.session) {
                console.error('Cannot setup form: no session');
                return;
            }

            // 1. Добавляем динамическое honeypot поле
            this.addDynamicHoneypot(form, this.session.honeypotField);

            // 2. Добавляем скрытое поле с sessionId
            const sessionField = document.createElement('input');
            sessionField.type = 'hidden';
            sessionField.name = '_sessionId';
            sessionField.value = this.session.sessionId;
            form.appendChild(sessionField);

            // 3. Вешаем обработчик отправки формы
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSubmit(form);
            });
        }

        /**
         * Добавляет динамическое honeypot поле к форме
         * @param {HTMLFormElement} form - DOM элемент формы
         * @param {string} fieldName - Имя honeypot поля (генерируется сервером)
         * 
         */
        addDynamicHoneypot(form, fieldName) {
            const formId = form.getAttribute('data-freeform');

            // Удаляем старые honeypot поля ЭТОЙ формы
            const oldHoneypots = form.querySelectorAll('[data-freeform-honeypot]');
            oldHoneypots.forEach(el => el.remove());

            // Создаём поле с ОРИГИНАЛЬНЫМ именем (которое ждёт сервер)
            const honeypot = document.createElement('input');
            honeypot.type = 'text';
            honeypot.name = fieldName; // ⭐ ИСПОЛЬЗУЕМ оригинальное имя, например "_hp_32432f78"

            // Data-атрибут для поиска
            honeypot.setAttribute('data-freeform-honeypot', formId);
            honeypot.setAttribute('data-session-id', this.session.sessionId);

            // Стили
            honeypot.style.cssText = `
            display: none !important;
            visibility: hidden !important;
            position: absolute !important;
            width: 0 !important;
            height: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            border: 0 !important;
            pointer-events: none !important;
            `;

            // Атрибуты (без aria-hidden чтобы избежать предупреждений)
            honeypot.setAttribute('autocomplete', 'new-password');
            honeypot.setAttribute('tabindex', '-1');

            // 🔴 УБИРАЕМ aria-hidden чтобы избежать предупреждений
            // honeypot.setAttribute('aria-hidden', 'true');

            form.appendChild(honeypot);
            console.log(`✅ Added honeypot for form "${formId}": ${fieldName}`);

            return honeypot;
        }

        /**
         * Обрабатывает отправку формы: собирает данные, отправляет на сервер, обновляет сессию
         * @async
         * @param {HTMLFormElement} form - DOM элемент формы
         */
        async handleSubmit(form) {
            const formId = form.getAttribute('data-freeform');
            const submitButton = form.querySelector('button[type="submit"], input[type="submit"]');
            const originalButtonText = submitButton ? submitButton.innerHTML : '';

            // Показываем состояние загрузки
            if (submitButton) {
                submitButton.innerHTML = '⏳ Отправка...';
                submitButton.disabled = true;
            }

            try {
                // Собираем данные из формы
                const data = {
                    formId: formId,
                    _sessionId: this.session.sessionId
                };

                // 1. Собираем обычные поля
                const elements = form.elements;
                for (let i = 0; i < elements.length; i++) {
                    const el = elements[i];
                    if (!el.name) continue;

                    if (el.name === 'email') {
                        data.email = el.value || '';
                    } else if (el.name === 'message') {
                        data.message = el.value || '';
                    } else if (el.name === '_sessionId') {
                        data._sessionId = el.value || this.session.sessionId;
                    }
                }

                // 2. Находим honeypot по data-атрибуту
                const honeypotField = form.querySelector(`[data-freeform-honeypot="${formId}"]`);
                if (honeypotField) {
                    const originalName = honeypotField.getAttribute('data-original-name') ||
                        this.session.honeypotField;

                    // Добавляем в данные с оригинальным именем (для сервера)
                    data[originalName] = honeypotField.value || '';

                    console.log(`🎣 Honeypot for "${formId}": ${originalName} = "${honeypotField.value}"`);
                } else {
                    // Если поле не найдено, добавляем пустое
                    data[this.session.honeypotField] = '';
                    console.warn(`⚠️ Honeypot not found for form "${formId}"`);
                }

                console.log('📦 Data to submit:', data);

                // 🔴 КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: ДОБАВИТЬ ОТПРАВКУ ЗАПРОСА
                const response = await fetch(this.config.apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    this.showSuccess(form, result.message || this.config.successMessage);
                    form.reset();

                    // Обновляем сессию после успешной отправки
                    await this.refreshSession();

                } else {
                    this.showError(form, result.message || this.config.errorMessage);

                    // Если ошибка связана с сессией - обновляем её
                    if (result.message && result.message.includes('session')) {
                        await this.refreshSession();
                        this.showError(form, 'Session refreshed. Please try again.');
                    }
                }

            } catch (error) {
                console.error('❌ FreeFormAPI Widget error:', error);
                this.showError(form, this.config.errorMessage);
            } finally {
                // Восстанавливаем кнопку отправки
                if (submitButton) {
                    submitButton.innerHTML = originalButtonText;
                    submitButton.disabled = false;
                }
            }
        }

        /**
         * Обновляет скрытые поля сессии в конкретной форме
         * @param {HTMLFormElement} form - DOM элемент формы
         */
        updateFormSessionFields(form) {
            if (!this.session) return;

            console.log('🔄 Updating form with new session:', this.session.sessionId);

            // 1. Обновляем honeypot поле
            const honeypotFields = form.querySelectorAll('[name^="_hp_"]');
            honeypotFields.forEach(field => {
                field.name = this.session.honeypotField;
                field.value = ''; // Очищаем значение (боты могли заполнить)
            });

            // 2. Обновляем поле sessionId
            const sessionField = form.querySelector('[name="_sessionId"]');
            if (sessionField) {
                sessionField.value = this.session.sessionId;
            } else {
                // Если поля нет - создаём
                const newSessionField = document.createElement('input');
                newSessionField.type = 'hidden';
                newSessionField.name = '_sessionId';
                newSessionField.value = this.session.sessionId;
                form.appendChild(newSessionField);
            }

            // 3. Если honeypot поле отсутствует - создаём его
            const hasHoneypot = form.querySelector(`[name="${this.session.honeypotField}"]`);
            if (!hasHoneypot) {
                this.addDynamicHoneypot(form, this.session.honeypotField);
            }
        }

        /**
        * Обновляет текущую сессию: получает новую с сервера и обновляет все формы
        * КРИТИЧЕСКОЕ ИЗМЕНЕНИЕ: полностью пересоздаёт honeypot поля
        */
        async refreshSession() {
            console.log('🔄 Refreshing session...');

            // 1. Получаем новую сессию
            const oldSessionId = this.session ? this.session.sessionId : 'none';
            this.session = await this.fetchNewSession();

            if (!this.session) {
                console.error('❌ Failed to refresh session');
                return;
            }

            // 2. Сохраняем в localStorage
            this.saveSessionToStorage('freeformapi_session', this.session);

            console.log(`🔄 Session refreshed: ${oldSessionId} → ${this.session.sessionId}`);
            console.log(`🎯 New honeypot field: ${this.session.honeypotField}`);

            // 3. КРИТИЧЕСКО: полностью пересоздаём все honeypot поля
            this.recreateAllHoneypotFields();

            return this.session;
        }

        /**
        * Полностью пересоздаёт все honeypot поля во всех формах
        */
        recreateAllHoneypotFields() {
            if (!this.session || !this.forms.length) return;

            this.forms.forEach((form, index) => {
                // Удалить все старые honeypot поля
                const oldHoneypots = form.querySelectorAll('[name^="_hp_"], [data-freeform-honeypot]');
                oldHoneypots.forEach(hp => hp.remove());

                // Создать новое поле с новым именем
                const newHoneypot = this.createNewHoneypot(form, this.session.honeypotField);

                // Обновить sessionId поле
                let sessionField = form.querySelector('[name="_sessionId"]');
                if (sessionField) {
                    sessionField.value = this.session.sessionId;
                } else {
                    sessionField = document.createElement('input');
                    sessionField.type = 'hidden';
                    sessionField.name = '_sessionId';
                    sessionField.value = this.session.sessionId;
                    form.appendChild(sessionField);
                }

                console.log(`✅ Form ${index} updated with new honeypot: ${newHoneypot.name}`);
            });
        }

        /**
        * Обновляет все формы на странице с новой сессией
        * УДАЛЯЕТ старые honeypot поля и создаёт новые
        */
        updateAllFormsSessions() {
            if (!this.session || !this.forms.length) return;

            this.forms.forEach(form => {
                // 1. ПОЛНОСТЬЮ УДАЛИТЬ все старые honeypot поля
                const oldHoneypots = form.querySelectorAll('[name^="_hp_"], [data-freeform-honeypot]');
                oldHoneypots.forEach(honeypot => {
                    honeypot.remove();
                    console.log(`🗑 Removed old honeypot: ${honeypot.name}`);
                });

                // 2. СОЗДАТЬ новое honeypot поле с новым именем
                this.addDynamicHoneypot(form, this.session.honeypotField);

                // 3. Обновить поле sessionId
                let sessionField = form.querySelector('[name="_sessionId"]');
                if (sessionField) {
                    sessionField.value = this.session.sessionId;
                } else {
                    sessionField = document.createElement('input');
                    sessionField.type = 'hidden';
                    sessionField.name = '_sessionId';
                    sessionField.value = this.session.sessionId;
                    form.appendChild(sessionField);
                }
            });

            console.log(`✅ Updated ${this.forms.length} forms with new session: ${this.session.honeypotField}`);
        }

        /**
        * Создаёт новое honeypot поле (перезаписывает старые)
        * @param {HTMLFormElement} form - DOM элемент формы
        * @param {string} fieldName - Новое имя поля
        */
        createNewHoneypot(form, fieldName) {
            // 1. Удалить все существующие honeypot поля
            const existingHoneypots = form.querySelectorAll('[name^="_hp_"], [data-freeform-honeypot]');
            existingHoneypots.forEach(el => el.remove());

            // 2. Создать новое поле
            const honeypot = document.createElement('input');
            honeypot.type = 'text';
            honeypot.name = fieldName;
            honeypot.id = `freeform-honeypot-${Date.now()}`;
            honeypot.setAttribute('data-freeform-honeypot', 'true');
            honeypot.setAttribute('data-session-id', this.session.sessionId);

            // Стили, видимые для ботов
            honeypot.style.cssText = `
            position: absolute !important;
            left: -9999px !important;
            top: -9999px !important;
            opacity: 0.001 !important;
            width: 1px !important;
            height: 1px !important;
            overflow: hidden !important;
            z-index: -9999 !important;
            `;

            // Атрибуты-приманки для ботов
            honeypot.setAttribute('class', 'form-control optional-field');
            honeypot.setAttribute('placeholder', 'Please leave this field empty');
            honeypot.setAttribute('title', 'Optional information');
            honeypot.setAttribute('autocomplete', 'off');
            honeypot.setAttribute('tabindex', '-1');
            honeypot.setAttribute('aria-hidden', 'true');

            form.appendChild(honeypot);

            // 3. Добавить observer для отслеживания изменений
            this.setupHoneypotObserver(honeypot);

            console.log(`🆕 Created new honeypot: ${fieldName}`);
            return honeypot;
        }

        /**
         * Наблюдает за изменениями в honeypot поле
         */
        setupHoneypotObserver(honeypotElement) {
            // MutationObserver для отслеживания изменений значения
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'value') {
                        const newValue = honeypotElement.value;
                        if (newValue && newValue.trim() !== '') {
                            console.log(`🎣 Honeypot value changed: "${newValue}"`);
                        }
                    }
                });
            });

            observer.observe(honeypotElement, {
                attributes: true,
                attributeFilter: ['value']
            });

            // 🔴 ИСПРАВЛЕНИЕ: Правильная перехват значения
            const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
            let currentValue = honeypotElement.value;

            Object.defineProperty(honeypotElement, 'value', {
                get() {
                    return currentValue;
                },
                set(newValue) {
                    currentValue = newValue;

                    // Логируем изменение
                    if (newValue && newValue.trim() !== '') {
                        console.log(`🎣 Honeypot value set programmatically: "${newValue}"`);
                    }

                    // Вызываем оригинальный сеттер
                    if (originalDescriptor && originalDescriptor.set) {
                        originalDescriptor.set.call(this, newValue);
                    }
                },
                configurable: true,
                enumerable: true
            });
        }

        /**
         * Обрабатывает ошибки инициализации: показывает fallback режим
         * @param {Error} error - Объект ошибки
         */
        handleInitError(error) {
            console.error('❌ FreeFormAPI init error:', error);
            console.log('⚠️ Using fallback mode');

            // Показываем кнопку для повторной попытки
            const retryButton = document.createElement('button');
            retryButton.innerHTML = '🔄 Retry FreeFormAPI';
            retryButton.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #007bff;
                color: white;
                border: none;
                padding: 10px 15px;
                border-radius: 5px;
                cursor: pointer;
                z-index: 10000;
            `;

            retryButton.onclick = async () => {
                retryButton.remove();
                await this.init();
            };

            document.body.appendChild(retryButton);

            // Fallback: настраиваем формы без сессионной системы
            this.forms = Array.from(document.querySelectorAll(this.config.formSelector));
            this.forms.forEach(form => {
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const formData = new FormData(form);
                    fetch(this.config.apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            formId: form.getAttribute('data-freeform'),
                            email: formData.get('email'),
                            message: formData.get('message'),
                            _honeypot: formData.get('_honeypot') || ''
                        })
                    }).then(r => r.json())
                        .then(result => alert(result.success ? '✅ Success' : '❌ Error'))
                        .catch(err => console.error(err));
                });
            });

            this.initialized = true;
        }

        /**
         * Показывает сообщение об успешной отправке
         * @param {HTMLFormElement} form - DOM элемент формы
         * @param {string} message - Текст сообщения
         */
        showSuccess(form, message) {
            this.showMessage(form, message, 'success');
        }

        /**
         * Показывает сообщение об ошибке отправки
         * @param {HTMLFormElement} form - DOM элемент формы
         * @param {string} message - Текст сообщения
         */
        showError(form, message) {
            this.showMessage(form, message, 'error');
        }

        /**
         * Отображает сообщение рядом с формой
         * @param {HTMLFormElement} form - DOM элемент формы
         * @param {string} message - Текст сообщения
         * @param {string} type - Тип сообщения: 'success', 'error', 'info'
         */
        showMessage(form, message, type = 'info') {
            // Удаляем предыдущие сообщения у этой формы
            const oldMessage = form.querySelector('.freeform-message');
            if (oldMessage) {
                oldMessage.remove();
            }

            // Создаём новое сообщение
            const messageDiv = document.createElement('div');
            messageDiv.className = `freeform-message freeform-${type}`;
            messageDiv.innerHTML = message;

            // Стили в зависимости от типа сообщения
            const styles = {
                success: {
                    borderColor: '#4CAF50',
                    backgroundColor: '#E8F5E9',
                    textColor: '#2E7D32'
                },
                error: {
                    borderColor: '#F44336',
                    backgroundColor: '#FFEBEE',
                    textColor: '#C62828'
                }
            };

            const style = styles[type] || styles.info;

            messageDiv.style.cssText = `
                margin: 10px 0;
                padding: 10px;
                border-radius: 4px;
                border: 1px solid ${style.borderColor};
                background-color: ${style.backgroundColor};
                color: ${style.textColor};
                font-family: Arial, sans-serif;
                font-size: 14px;
            `;

            // Вставляем сообщение после формы
            form.parentNode.insertBefore(messageDiv, form.nextSibling);

            // Автоматически скрываем через 5 секунд
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.style.transition = 'opacity 0.5s';
                    messageDiv.style.opacity = '0';
                    setTimeout(() => {
                        if (messageDiv.parentNode) {
                            messageDiv.remove();
                        }
                    }, 500);
                }
            }, 5000);
        }

        /**
         * Ручная отправка формы (для программистов)
         * @param {string} formId - Идентификатор формы
         * @param {Object} data - Данные для отправки
         * @returns {Promise<Object>} Результат отправки
         */
        submitForm(formId, data) {
            const form = document.querySelector(`[data-freeform="${formId}"]`);
            if (!form) {
                console.error(`FreeFormAPI: форма с ID "${formId}" не найдена`);
                return Promise.reject(new Error('Form not found'));
            }

            return fetch(this.config.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    formId: formId,
                    ...data,
                    [this.config.honeypotField]: '' // Пустое honeypot поле
                })
            }).then(response => response.json());
        }


        /**
        * Тестовая функция: заполняет honeypot и отправляет форму
        * @param {string} formId - ID формы для теста
        */
        async testHoneypot(formId, testValue = null) {
            const form = document.querySelector(`[data-freeform="${formId}"]`);
            if (!form) {
                console.error(`❌ Form "${formId}" not found`);
                return;
            }

            // Находим honeypot поле
            const honeypot = form.querySelector(`[data-freeform-honeypot="${formId}"]`);
            if (!honeypot) {
                console.error(`❌ No honeypot found for form "${formId}"`);

                // Покажем все honeypot поля для отладки
                const allHoneypots = document.querySelectorAll('[data-freeform-honeypot]');
                console.log('All honeypots on page:', Array.from(allHoneypots).map(hp => ({
                    form: hp.closest('form')?.getAttribute('data-freeform'),
                    name: hp.name,
                    value: hp.value
                })));

                return;
            }

            // Заполняем honeypot
            const testVal = testValue || `test-bot-${Date.now()}`;
            honeypot.value = testVal;

            console.log(`🤖 Test: Set honeypot "${honeypot.name}" = "${honeypot.value}"`);
            console.log(`📝 Form ID: ${formId}, Session ID: ${this.session.sessionId}`);

            // Проверяем, что значение установилось
            console.log(`🔍 Checking honeypot value: ${honeypot.value === testVal ? '✅ OK' : '❌ FAIL'}`);

            // Отправляем форму
            await this.handleSubmit(form);
        }

    }



    // ====================== ГЛОБАЛЬНЫЙ ЭКСПОРТ ======================
    window.FreeFormAPI = {
        /**
         * Инициализировать виджет
         * @param {Object} config - Конфигурация
         * @returns {Promise<FreeFormWidget>} Экземпляр виджета
         */
        init: async function (config = {}) {
            // Если уже инициализирован - вернуть экземпляр
            if (activeWidgetInstance && activeWidgetInstance.initialized) {
                console.log('✅ FreeFormAPI already initialized');
                return activeWidgetInstance;
            }

            // Если в процессе инициализации - добавить в очередь
            if (isInitializing) {
                return new Promise((resolve) => {
                    initQueue.push({ config, resolve });
                });
            }

            isInitializing = true;

            return new Promise((resolve, reject) => {
                const initFunction = async () => {
                    try {
                        // Создаём и инициализируем экземпляр
                        activeWidgetInstance = new FreeFormWidget(config);
                        await activeWidgetInstance.init();

                        // Сохраняем для глобального доступа
                        window.__freeformWidget = activeWidgetInstance;

                        // Обрабатываем очередь
                        while (initQueue.length > 0) {
                            const { resolve: queuedResolve } = initQueue.shift();
                            queuedResolve(activeWidgetInstance);
                        }

                        resolve(activeWidgetInstance);
                    } catch (error) {
                        reject(error);
                    } finally {
                        isInitializing = false;
                    }
                };

                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', initFunction);
                } else {
                    initFunction();
                }
            });
        },

        /**
         * Получить текущий экземпляр виджета
         * @returns {FreeFormWidget|null}
         */
        getInstance: function () {
            return activeWidgetInstance;
        },

        /**
         * Получить текущую сессию
         * @returns {Object|null}
         */
        getSession: function () {
            return activeWidgetInstance ? activeWidgetInstance.session : null;
        },

        /**
         * Отправить форму программно
         * @param {string} formId - ID формы
         * @param {Object} data - Данные
         * @returns {Promise<Object>}
         */
        submit: function (formId, data) {
            if (!activeWidgetInstance) {
                return Promise.reject(new Error('Widget not initialized. Call FreeFormAPI.init() first.'));
            }
            return activeWidgetInstance.submitForm(formId, data);
        },

        /**
         * Тестовая функция: заполнить honeypot и отправить
         * @param {string} formId - ID формы
         * @returns {Promise<void>}
         */
        testHoneypot: async function (formId) {
            if (!activeWidgetInstance) {
                console.error('❌ Widget not initialized. Call FreeFormAPI.init() first.');
                return;
            }

            // Убедиться, что виджет инициализирован
            if (!activeWidgetInstance.initialized) {
                console.log('🔄 Widget not initialized yet, initializing...');
                await this.init();
            }

            return activeWidgetInstance.testHoneypot(formId);
        },

        /**
         * Отладочная функция: показать все honeypot поля
         * @returns {Array}
         */
        debugHoneypots: function () {
            if (!activeWidgetInstance) {
                console.error('❌ Widget not initialized');
                return [];
            }

            const honeypots = document.querySelectorAll('[name^="_hp_"], [data-freeform-honeypot]');
            const result = Array.from(honeypots).map(hp => ({
                name: hp.name,
                value: hp.value,
                sessionId: hp.getAttribute('data-session-id') || 'unknown',
                isCurrent: activeWidgetInstance.session &&
                    hp.name === activeWidgetInstance.session.honeypotField,
                element: hp
            }));

            console.log('🔍 FreeFormAPI Debug - Honeypot Fields:', result);
            return result;
        },

        /**
         * Включить режим отладки
         */
        enableDebug: function () {
            if (!activeWidgetInstance) {
                console.error('❌ Widget not initialized');
                return;
            }

            // Добавить CSS для визуализации
            const style = document.createElement('style');
            style.id = 'freeformapi-debug-styles';
            style.textContent = `
            [data-freeform-honeypot] {
                outline: 2px dashed red !important;
                background: rgba(255, 0, 0, 0.05) !important;
            }
            .freeform-honeypot-label {
                position: absolute;
                background: red;
                color: white;
                padding: 2px 5px;
                font-size: 10px;
                font-family: monospace;
                z-index: 999999;
                pointer-events: none;
            }
        `;

            if (!document.getElementById('freeformapi-debug-styles')) {
                document.head.appendChild(style);
            }

            // Добавить лейблы к honeypot полям
            document.querySelectorAll('[data-freeform-honeypot]').forEach(hp => {
                if (!hp.nextElementSibling || !hp.nextElementSibling.classList.contains('freeform-honeypot-label')) {
                    const label = document.createElement('div');
                    label.className = 'freeform-honeypot-label';
                    label.textContent = `HONEYPOT: ${hp.name}`;
                    label.style.top = `${hp.offsetTop - 20}px`;
                    label.style.left = `${hp.offsetLeft}px`;
                    hp.parentNode.insertBefore(label, hp.nextSibling);
                }
            });

            console.log('🔧 FreeFormAPI Debug mode enabled');
            console.log('👁️ Honeypot fields highlighted in red');
        },

        /**
         * Обновить сессию вручную
         * @returns {Promise<Object>} Новая сессия
         */
        refreshSession: async function () {
            if (!activeWidgetInstance) {
                console.error('❌ Widget not initialized');
                return null;
            }

            return activeWidgetInstance.refreshSession();
        }
    };

    // Автоматическая инициализация
    if (document.querySelector(DEFAULT_CONFIG.formSelector)) {
        setTimeout(() => {
            window.FreeFormAPI.init().catch(err => {
                console.error('❌ Auto-init failed:', err);
            });
        }, 100);
    }

})();