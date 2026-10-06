import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function validatePlayReleaseInputs(status, fraction = '') {
  if (!['draft', 'completed', 'halted', 'inProgress'].includes(status)) {
    throw new Error('Unsupported Play release status');
  }
  const value = String(fraction).trim();
  const staged = status === 'halted' || status === 'inProgress';
  if (!staged && value) throw new Error('user_fraction is only allowed for staged rollout actions');
  if (staged && !value) throw new Error('user_fraction is required for a staged rollout action');
  if (staged && (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) || !(Number(value) > 0 && Number(value) < 1))) {
    throw new Error('user_fraction must be a decimal greater than 0 and less than 1');
  }
  return { status, userFraction: value };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validatePlayReleaseInputs(process.env.RELEASE_STATUS || 'draft', process.env.USER_FRACTION || '');
  if (!process.env.GITHUB_ENV) throw new Error('GITHUB_ENV is required');
  appendFileSync(process.env.GITHUB_ENV, `PLAY_USER_FRACTION=${result.userFraction}\n`);
  console.log(`Play release inputs validated: ${result.status}`);
}
