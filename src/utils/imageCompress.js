// Сжатие изображений перед отправкой на сервер
// Веб: через canvas. Нативный: через expo-image-manipulator (если установлен).

import { Platform } from 'react-native';

/**
 * Сжать изображение до maxSide px, качество 0.7 JPEG.
 * @param uri - локальный uri (blob:, file:, data:)
 * @param opts.maxSide - макс. сторона в px (default 1200)
 * @param opts.quality - 0..1 (default 0.7)
 * @returns Promise<string> - URI готового сжатого jpeg
 */
export async function compressImage(uri, opts = {}) {
  const maxSide = opts.maxSide || 1200;
  const quality = opts.quality != null ? opts.quality : 0.7;

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
