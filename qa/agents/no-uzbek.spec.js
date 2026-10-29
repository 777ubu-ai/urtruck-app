// Имя файла сохранено для существующих вызовов. Решение владельца29.10:
// UZ снова разрешён, но каждый выбираемый язык обязан иметь полный словарь.
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const ENABLED = ['TR', 'UZ', 'KY', 'TG', 'BE'];
function scan() {
  const violations = [];
  for (const code of ENABLED) {
    const file = path.join(ROOT, 'src/utils/locales', code.toLowerCase() + '.js');
    if (!fs.existsSync(file)) { violations.push({ code, reason: 'missing_catalog' }); continue; }
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^export default /, '').replace(/;\s*$/, ''));
    if (Object.keys(data.common).length !== 2048 || Object.values(data.common).some(v => typeof v !== 'string' || !v.trim())) violations.push({ code, reason: 'incomplete_catalog' });
  }
  const selector = fs.readFileSync(path.join(ROOT, 'src/components/LanguageSwitcher.js'), 'utf8');
  if (!selector.includes('LANGUAGES.filter(item => translations[item.code])')) violations.push({ reason: 'selector_allows_unavailable_catalog' });
  return violations;
}
try {
  const { test, expect } = require('@playwright/test');
  test('в списке только полностью переведённые языки', () => expect(scan()).toEqual([]));
} catch {
  if (require.main === module) { const result = scan(); console.log(JSON.stringify(result)); process.exitCode = result.length ? 1 : 0; }
}
module.exports = { scan };
