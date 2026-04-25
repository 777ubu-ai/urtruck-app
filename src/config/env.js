// Центральная конфигурация API URL
// В production заменить на реальный домен
// Для dev: используется IP сервера

const IS_LOCALHOST = typeof window !== 'undefined' && window.location?.hostname === 'localhost';

export const API_URL = IS_LOCALHOST
  ? 'http://185.22.65.11:8001'
  : '/security';

export const API_BASE = `${API_URL}/api/v1`;

export const WEB_URL = IS_LOCALHOST
  ? 'http://185.22.65.11:8080'
  : '';

export const IS_BETA = true; // TODO: read from /api/version
