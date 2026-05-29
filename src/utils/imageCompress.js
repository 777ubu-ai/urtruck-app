// Сжатие изображений перед отправкой на сервер
// Веб: через canvas. Нативный: через expo-image-manipulator (если установлен).

import { Platform } from 'react-native';

// ТЗ онбординг §1 — пресеты сжатия по типу фото. Документы жмём слабее
// (1600px / q0.8), т.к. OCR нужен читаемый текст; селфи и фото грузовика —
// сильнее. targetKB — целевой потолок; если первый проход его превысил,
// делаем второй проход с quality − 0.1 (см. compressImage).
export const PHOTO_PRESETS = {
  selfie:   { maxSide: 1080, quality: 0.7,  targetKB: 400 },
  document: { maxSide: 1600, quality: 0.8,  targetKB: 800 },
  truck:    { maxSide: 1280, quality: 0.75, targetKB: 600 },
};

/**
 * Сжать изображение до maxSide px, качество JPEG.
 * @param uri - локальный uri (blob:, file:, data:)
 * @param opts.maxSide - макс. сторона в px (default 1200)
 * @param opts.quality - 0..1 (default 0.7)
 * @param opts.targetKB - целевой потолок размера в КБ; при превышении —
 *        дополнительный проход с quality − 0.1 (до 2 раз). Необязателен.
 * @param opts.preset - имя пресета из PHOTO_PRESETS ('selfie'|'document'|'truck').
 *        Перекрывается явными maxSide/quality/targetKB.
 * @returns Promise<string> - URI готового сжатого jpeg
 */
export async function compressImage(uri, opts = {}) {
  const preset = opts.preset && PHOTO_PRESETS[opts.preset] ? PHOTO_PRESETS[opts.preset] : {};
  const maxSide = opts.maxSide || preset.maxSide || 1200;
  const baseQuality = opts.quality != null ? opts.quality : (preset.quality != null ? preset.quality : 0.7);
  const targetKB = opts.targetKB != null ? opts.targetKB : preset.targetKB;

  let quality = baseQuality;
  let out = await compressOnce(uri, maxSide, quality);

  // Второй проход (и третий) с q−0.1, если файл всё ещё превышает лимит.
  // Не опускаемся ниже 0.4 — иначе OCR/лицо деградируют. Если размер
  // измерить не удалось (нет FileSystem на нативе) — пропускаем.
  if (targetKB) {
    for (let i = 0; i < 2 && quality > 0.4; i++) {
      const kb = await byteSizeKB(out);
      if (kb == null || kb <= targetKB) break;
      quality = Math.max(0.4, Math.round((quality - 0.1) * 100) / 100);
      out = await compressOnce(uri, maxSide, quality);
    }
  }
  return out;
}

async function compressOnce(uri, maxSide, quality) {
  if (Platform.OS === 'web') {
    return compressWeb(uri, maxSide, quality);
  }
  // На нативе — используем expo-image-manipulator если есть
  try {
    const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
    // Делаем два прохода: сначала resize, потом compress
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: maxSide } }],
      { compress: quality, format: SaveFormat.JPEG },
    );
    return result.uri;
  } catch {
    // Fallback — вернуть оригинал
    return uri;
  }
}

// Приблизительный размер изображения в КБ. data:/base64 считаем напрямую,
// для file:// на нативе — через expo-file-system (если доступен). null =
// измерить не удалось (вызывающий тогда не делает доп. проход).
async function byteSizeKB(uri) {
  try {
    if (typeof uri === 'string' && uri.startsWith('data:')) {
      const b64 = uri.slice(uri.indexOf(',') + 1);
      const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
      return Math.round((b64.length * 3 / 4 - padding) / 1024);
    }
    if (Platform.OS !== 'web') {
      const FileSystem = await import('expo-file-system');
      const info = await FileSystem.getInfoAsync(uri, { size: true });
      if (info && info.size != null) return Math.round(info.size / 1024);
    }
  } catch {
    /* измерить не удалось */
  }
  return null;
}

async function compressWeb(uri, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        let { width, height } = img;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = uri;
  });
}
