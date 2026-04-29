import { Platform } from 'react-native';

const IS_WEB = Platform.OS === 'web';

// WEB: запросы идут через nginx на https://urtruck.kz/api/v1
// MOBILE: запросы идут напрямую на backend
export const SERVER_URL = IS_WEB ? '' : 'http://185.22.65.11:8001';

export const API_URL = SERVER_URL;
export const API_BASE = `${SERVER_URL}/api/v1`;
export const API_BASE_URL = SERVER_URL;

export const WEB_URL = IS_WEB
  ? 'https://urtruck.kz'
  : 'http://185.22.65.11:8080';

export const IS_BETA = true;

export default {
  SERVER_URL,
  API_URL,
  API_BASE,
  API_BASE_URL,
  WEB_URL,
  IS_BETA,
};
