import { writeFile } from 'node:fs/promises';
import rows from '../src/data/worldCities.js';

// Подготовка выполняется при генерации справочника, без изменения исходных полей.
const probe = 'IİÌÍĨJ\u0301I\u0307';
for (const cities of Object.values(rows)) {
  for (const row of cities) row[6] = [row[0], ...row[1]].map(label => label.toLocaleLowerCase());
}
await writeFile(new URL('../src/data/worldCities.js', import.meta.url),
  '// GeoNames cities15000, CC BY 4.0. See docs/geonames-attribution.md.\n'
  + `export const searchCaseProbe = ${JSON.stringify(probe.toLocaleLowerCase())};\n`
  + `export default ${JSON.stringify(rows)};\n`);
