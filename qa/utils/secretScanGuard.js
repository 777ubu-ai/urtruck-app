import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const binarySuffixes = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ttf', '.ico', '.jar', '.zip',
  '.gz', '.sqlite', '.db', '.pdf', '.mov', '.mp4',
]);

const patterns = [
  ['OpenAI key', /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/g],
  ['AWS access key', /AKIA[0-9A-Z]{16}/g],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/g],
  ['JWT', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ['Telegram bot token', /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g],
  ['Private key block', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----/g],
  ['Supabase service role JWT', /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*"role":"service_role"[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+/g],
  ['Generic committed secret assignment', /\b(?:secret|client_secret|access_key|api_key|password|passwd|pwd)\b\s*[:=]\s*["']?([A-Za-z0-9_./+=-]{24,})/gi],
];

const allowedPublicClientCredentials = [
  {
    file: 'google-services.json',
    reason: 'Firebase Android client API key is public by platform design; release gate verifies restrictions separately.',
    pattern: /AIza[0-9A-Za-z_-]{35}/g,
  },
  {
    file: 'src/config/supabase.js',
    reason: 'Supabase anon JWT is a browser client key; release gate requires RLS/policy verification separately.',
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
];

const ignoredLineFragments = [
  'process.env',
  'os.getenv',
  '${{ secrets.',
  '$QA_AGENT_TOKEN',
  '<bearer>',
  '<token>',
  'ExponentPushToken[...]',
  'ci-test-salt-not-a-secret',
  'demo-api-key-change-me',
  'change_me',
  'placeholder',
  'dummy',
  'mock',
  'test',
  'secrets.token_urlsafe',
  'reg_dal.create_session',
  'authorization.split',
  'request.headers.get',
  'tokenData?.data',
  'session.token',
  'localStorage.getItem',
  'readToken()',
  'mask_token',
  '_get_api_key()',
];

function suffixOf(path) {
  const idx = path.lastIndexOf('.');
  return idx >= 0 ? path.slice(idx).toLowerCase() : '';
}

function redact(value) {
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-4)}` : `${value.slice(0, 3)}…`;
}

function isAllowedPublicCredential(file, value) {
  return allowedPublicClientCredentials.some((rule) => {
    if (rule.file !== file) return false;
    rule.pattern.lastIndex = 0;
    return rule.pattern.test(value);
  });
}

const findings = [];
const publicFindings = [];

for (const file of files) {
  if (binarySuffixes.has(suffixOf(file))) continue;
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (ignoredLineFragments.some((fragment) => line.includes(fragment))) return;
    for (const [label, regex] of patterns) {
      regex.lastIndex = 0;
      for (const match of line.matchAll(regex)) {
        const value = match[0];
        if (isAllowedPublicCredential(file, value)) {
          publicFindings.push({ file, line: index + 1, label, value });
          continue;
        }
        findings.push({ file, line: index + 1, label, value });
      }
    }
  });
}

for (const item of publicFindings) {
  console.log(`[secret-scan] public-client-key ${item.file}:${item.line} ${redact(item.value)}`);
}

if (findings.length) {
  for (const item of findings) {
    console.error(`[secret-scan] BLOCK ${item.file}:${item.line} ${item.label} ${redact(item.value)}`);
  }
  throw new Error(`Secret scan blocked ${findings.length} tracked finding(s)`);
}

console.log(`[secret-scan] OK — ${files.length} tracked files scanned; private secret findings: 0; public client credentials: ${publicFindings.length}`);
