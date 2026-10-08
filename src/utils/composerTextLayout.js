// Высота iOS composer считается по отрисованным строкам, независимо от
// contentSize UITextView с уже назначенной ему фиксированной рамкой.
export function measureComposerLines(draft, lines, minimum = 44, padding = 16, limit = 4) {
  if (!String(draft || '').length) return { height: minimum, scroll: false };
  if (!Array.isArray(lines) || !lines.length) return null;
  const heights = lines.map((line) => Number(line?.height));
  if (heights.some((height) => !Number.isFinite(height) || height <= 0)) return null;
  return {
    height: Math.max(minimum, Math.ceil(heights.slice(0, limit).reduce((sum, height) => sum + height, 0) + padding)),
    scroll: heights.length > limit,
  };
}
