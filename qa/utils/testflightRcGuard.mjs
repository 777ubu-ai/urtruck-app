import fs from 'node:fs';

export function validateProductionProfile(eas) {
  const production = eas?.build?.production;
  if (!production || typeof production !== 'object') {
    throw new Error('Missing eas.build.production profile');
  }
  if (production.developmentClient === true) {
    throw new Error('Production profile cannot enable developmentClient');
  }
  if (production.distribution === 'internal') {
    throw new Error('Production profile cannot use internal distribution');
  }
  if (production.ios?.simulator === true) {
    throw new Error('Production profile cannot target simulator');
  }
  const serialized = JSON.stringify(production).toLowerCase();
  if (serialized.includes('debug')) {
    throw new Error('Production profile contains a debug-only setting');
  }
  return true;
}

if (process.argv[1]?.endsWith('testflightRcGuard.mjs')) {
  const file = process.argv[2] || 'eas.json';
  validateProductionProfile(JSON.parse(fs.readFileSync(file, 'utf8')));
  console.log('TestFlight RC production profile: PASS');
}
