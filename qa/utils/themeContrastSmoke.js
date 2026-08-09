// themeContrastSmoke — WCAG-контраст обеих тем (P1 theme fix 2026-08).
// Держит палитры LIGHT/DARK из designV1.js в проверяемом виде: любой новый
// FAIL валит CI. Значения обязаны совпадать с src/theme/designV1.js.
//
//   node qa/utils/themeContrastSmoke.js

function lum(hex) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    let v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) { const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x); return (l1 + 0.05) / (l2 + 0.05); }

const LIGHT = {
  bg: '#F6F8F7', surface: '#FFFFFF', border: '#E5ECE8',
  text: '#14221C', textMuted: '#617067', textDim: '#7C8B82', placeholder: '#6B7A71',
  driver: '#168759', driverDeep: '#0F6B47', driverSoft: '#E8F6EF',
  error: '#D64545', warning: '#F59E0B', info: '#3478D4', rating: '#D97706',
};
const DARK = {
  bg: '#0F1512', surface: '#151E19', surfaceLift: '#1B2620', border: '#2A3930',
  text: '#F3F7F4', textMuted: '#B7C3BB', textDim: '#9EAAA2', placeholder: '#9EAAA2',
  driver: '#168759', driverDeep: '#0F6B47', success: '#63D69A',
  error: '#FF7B7B', warning: '#F5B75B', info: '#5BA3F5', cargoOwner: '#168759', rating: '#D97706',
};

let fails = 0;
function group(name, pairs) {
  console.log(`\n— ${name} —`);
  for (const [label, fg, bg, req] of pairs) {
    const r = ratio(fg, bg);
    const ok = r >= req;
    if (!ok) fails++;
    console.log(`${r.toFixed(2).padStart(5)} need>=${req}  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  }
}

group('LIGHT', [
  ['text on bg', LIGHT.text, LIGHT.bg, 4.5],
  ['text on card', LIGHT.text, LIGHT.surface, 4.5],
  ['muted on bg', LIGHT.textMuted, LIGHT.bg, 4.5],
  ['muted on card', LIGHT.textMuted, LIGHT.surface, 4.5],
  ['placeholder on card', LIGHT.placeholder, LIGHT.surface, 4.5],
  ['white on green CTA', '#FFFFFF', LIGHT.driver, 4.5],
  ['white on deep CTA', '#FFFFFF', LIGHT.driverDeep, 4.5],
  ['deep green on soft tint', LIGHT.driverDeep, LIGHT.driverSoft, 4.5],
  ['error on card (large/icon)', LIGHT.error, LIGHT.surface, 3],
  ['info on card (large)', LIGHT.info, LIGHT.surface, 3],
  ['rating on card (graphic)', LIGHT.rating, LIGHT.surface, 3],
]);

group('DARK', [
  ['text on bg', DARK.text, DARK.bg, 4.5],
  ['text on surface', DARK.text, DARK.surface, 4.5],
  ['muted on surface', DARK.textMuted, DARK.surface, 4.5],
  ['dim on surface', DARK.textDim, DARK.surface, 4.5],
  ['placeholder on surface', DARK.placeholder, DARK.surface, 4.5],
  ['white on green CTA', '#FFFFFF', DARK.driver, 4.5],
  ['success/accent text on surface', DARK.success, DARK.surface, 4.5],
  ['error on surface', DARK.error, DARK.surface, 4.5],
  ['warning on surface (large)', DARK.warning, DARK.surface, 3],
  ['info on surface', DARK.info, DARK.surface, 4.5],
  ['orange on surface (large)', DARK.cargoOwner, DARK.surface, 3],
]);

console.log(fails === 0 ? '\n[theme-contrast] OK — both themes WCAG-clean' : `\n[theme-contrast] ${fails} FAILS`);
process.exit(fails === 0 ? 0 : 1);
