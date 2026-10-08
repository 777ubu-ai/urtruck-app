import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function assertProductionApkConfig(config) {
  const apiUrl = String(config?.extra?.urtruckApiUrl || '').replace(/\/+$/, '');
  if (apiUrl !== 'https://urtruck.kz') {
    throw new Error(`Production APK embedded API config must be https://urtruck.kz; got ${apiUrl || '(missing)'}`);
  }
  if (config?.extra?.urtruckBuildFlavor !== 'production') {
    throw new Error('Production APK embedded build flavor must be production');
  }
  if (config?.android?.package !== 'com.urtruck.app') {
    throw new Error('Production APK embedded Android package must be com.urtruck.app');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: node scripts/verify-production-apk-config.mjs <embedded-app-config.json>');
  assertProductionApkConfig(JSON.parse(readFileSync(path, 'utf8')));
  process.stdout.write('Verified embedded production API host, flavor, and package\n');
}
