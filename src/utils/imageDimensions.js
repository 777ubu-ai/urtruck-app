// Ограничиваем длинную сторону, сохраняя пропорции и не увеличивая оригинал.
export function fitImageDimensions(width, height, maxSide) {
  if (![width, height, maxSide].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('Invalid image dimensions');
  }
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
