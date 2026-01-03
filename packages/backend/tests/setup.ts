// tests/setup.ts
import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });
jest.setTimeout(30000);

// Отключаем ВСЕ логи
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'info').mockImplementation(() => {});
jest.spyOn(console, 'debug').mockImplementation(() => {});