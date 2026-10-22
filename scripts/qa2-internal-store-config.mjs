import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertProductionApkConfig } from './verify-production-apk-config.mjs';
export function storeTarget(environment = 'production', track = 'internal') {
  if (!['production', 'qa2'].includes(environment)) throw Error('Неизвестная среда сборки');
  if (environment === 'qa2' && track !== 'internal') throw Error('QA2 разрешён только для Internal testing');
  return { api: environment === 'qa2' ? 'https://qa2.urtruck.kz' : 'https://urtruck.kz', internal: environment === 'qa2' ? 'true' : 'false' };
}
export function assertStoreConfig(config, environment, track, expectedSha) {
  const target = storeTarget(environment, track);
  if (expectedSha && (!/^[0-9a-f]{40}$/.test(expectedSha) || config?.extra?.urtruckSourceSha !== expectedSha)) throw Error('SHA встроенной конфигурации не совпадает с исходником');
  if (environment === 'production') return assertProductionApkConfig(config);
  // Internal использует прежний package/flavor для совместимого обновления через Play.
  if (config?.android?.package !== 'com.urtruck.app' || config?.extra?.urtruckBuildFlavor !== 'production'
      || config?.extra?.urtruckApiUrl !== target.api) throw Error('Неверная встроенная конфигурация QA2 Internal');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const environment = process.env.API_ENVIRONMENT || 'production', track = process.env.PLAY_TRACK || 'internal';
  const target = storeTarget(environment, track);
  if (process.argv[2]) {
    assertStoreConfig(JSON.parse(readFileSync(process.argv[2], 'utf8')), environment, track, process.env.GITHUB_SHA || process.env.URTRUCK_SOURCE_SHA);
    console.log(`Проверен встроенный API ${target.api}, package и режим ${environment}/${track}`);
  } else {
    if (!process.env.GITHUB_ENV) throw Error('Требуется GITHUB_ENV');
    appendFileSync(process.env.GITHUB_ENV, `EXPO_PUBLIC_API_URL=${target.api}\nURTRUCK_QA2_INTERNAL_STORE=${target.internal}\nAPI_ENVIRONMENT=${environment}\nPLAY_TRACK=${track}\n`);
    console.log(`Цель сборки: ${environment}/${track}, API ${target.api}`);
  }
}
