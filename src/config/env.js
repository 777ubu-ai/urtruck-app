import { Platform } from 'react-native';

const SERVER_URL = 'http://185.22.65.11:8001';
const WEB_PROXY_URL = '/security';

const IS_WEB = Platform.OS === 'web';
const IS_LOCALHOST =
  IS_WEB &&
  typeof window !== 'undefined' &&
  window.location?.hostname === 'localhost';

export const API_URL = IS_WEB
  ? (IS_LOCALHOST ? SERVER_URL : WEB_PROXY_URL)
  : SERVER_URL;

export const API_BASE = `${API_URL}/api/v1`;

export const WEB_URL = IS_WEB
  ? (IS_LOCALHOST ? 'http://185.22.65.11:8080' : '')
  : '';

export const IS_BETA = true;
