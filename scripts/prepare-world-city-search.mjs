import { writeFile } from 'node:fs/promises';
import rows from '../src/data/worldCities.js';

// Подготовка выполняется при генерации справочника, без изменения имён и координат.
const probe = 'IİÌÍĨJ\u0301I\u0307';
// Дополнительный вариант ввода сохраняет исходные алиасы и идентичность GeoNames.
const extraAliases = new Map([['5128581', ['Нью Йорк']]]);
for (const cities of Object.values(rows)) {
  for (const row of cities) {
    for (const alias of extraAliases.get(row[5]) || []) {
      if (!row[1].includes(alias)) row[1].push(alias);
    }
    row[6] = [row[0], ...row[1]].map(label => label.toLocaleLowerCase());
  }
}
await writeFile(new URL('../src/data/worldCities.js', import.meta.url),
  '// GeoNames cities15000, CC BY 4.0. See docs/geonames-attribution.md.\n'
  + `export const searchCaseProbe = ${JSON.stringify(probe.toLocaleLowerCase())};\n`
  + `export default ${JSON.stringify(rows)};\n`);
