import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (config.extra?.urtruckExternalFreightFeedEnabled !== true) {
  throw new Error('В собранном артефакте внешняя лента отключена');
}
console.log('В собранном артефакте внешняя лента включена');
