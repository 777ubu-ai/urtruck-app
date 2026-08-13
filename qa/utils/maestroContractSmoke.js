const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const MAESTRO = path.join(ROOT, 'qa', 'maestro');
const ENTRY = path.join(MAESTRO, 'smoke-suite.yaml');
const forbidden = [
  'bottom-nav-chats',
  'bottom-nav-chats-badge',
  'bottom-nav-profile',
  'bottom-nav-publish',
  'deals-seg-chats',
];

const visited = new Set();
const failures = [];

function visit(file) {
  const resolved = path.resolve(file);
  if (visited.has(resolved)) return;
  visited.add(resolved);
  if (!fs.existsSync(resolved)) {
    failures.push(`missing flow: ${path.relative(MAESTRO, resolved)}`);
    return;
  }
  const source = fs.readFileSync(resolved, 'utf8');
  const relative = path.relative(MAESTRO, resolved);
  if (relative.split(path.sep).includes('_obsolete')) failures.push(`release suite references obsolete flow: ${relative}`);
  for (const selector of forbidden) {
    const staleUse = new RegExp(`(?:tapOn|assertVisible):[^\\n]*(?:\\n[^\\n]*){0,3}${selector}`);
    if (staleUse.test(source)) failures.push(`${relative}: stale active selector ${selector}`);
  }
  const refs = [...source.matchAll(/runFlow:\s*([^\s#]+\.ya?ml)/g)].map((m) => m[1]);
  for (const ref of refs) visit(path.resolve(path.dirname(resolved), ref));
}

visit(ENTRY);
if (failures.length) {
  console.error('[maestro-contract] FAIL');
  failures.forEach((item) => console.error(`  - ${item}`));
  process.exit(1);
}
console.log(`[maestro-contract] OK: ${visited.size} release flows, current navigation only`);
