// Высота iOS composer считается по отрисованным строкам, независимо от
// contentSize UITextView с уже назначенной ему фиксированной рамкой.
export function measureComposerLines(draft, lines, minimum = 44, padding = 16, limit = 4) {
  if (!String(draft || '').length) return { height: minimum, scroll: false };
  if (!Array.isArray(lines) || !lines.length) return null;
  const heights = lines.map((line) => Number(line?.height));
  if (heights.some((height) => !Number.isFinite(height) || height <= 0)) return null;
  const visible = lines.slice(0, limit);
  let extent = heights.slice(0, limit).reduce((sum, height) => sum + height, 0);
  // Метрики glyph height могут быть меньше межстрочного шага: y сохраняет
  // leading, который потерялся бы при простом сложении высот glyph.
  if (visible.every((line) => Number.isFinite(line.y) && line.y >= 0)) {
    const last = visible[visible.length - 1];
    const advance = visible.length > 1 ? last.y - visible[visible.length - 2].y : 0;
    if (advance < 0) return null;
    extent = last.y + Math.max(last.height, advance);
  }
  return {
    height: Math.max(minimum, Math.ceil(extent + padding)),
    scroll: heights.length > limit,
  };
}
