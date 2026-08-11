import fs from 'node:fs';
import assert from 'node:assert/strict';

const helper = fs.readFileSync('scripts/deploy-ssh.sh', 'utf8');
const workflow = fs.readFileSync('.github/workflows/secure-production-deploy.yml', 'utf8');

assert.ok(!/ssh-keyscan/.test(helper.replace(/^#.*$/gm, '')), 'deploy helper must not learn host keys at runtime');
assert.ok(/SERVER_SSH_KNOWN_HOSTS:\?/.test(helper), 'key mode must fail closed without pinned known_hosts');
assert.ok(/StrictHostKeyChecking=yes/.test(helper), 'key mode must enforce StrictHostKeyChecking=yes');
assert.ok(/chmod 600/.test(helper), 'temporary SSH files must be mode 600');
assert.ok(/trap cleanup EXIT/.test(helper), 'temporary SSH files must have EXIT cleanup');
assert.ok(/Never print secret material/.test(helper), 'dry-run output must be explicitly secret-safe');

assert.ok(/workflow_run:/.test(workflow), 'secure deploy must run after legacy deploy completion');
assert.ok(/environment: production/.test(workflow), 'secure deploy must target production environment');
assert.ok(/permissions:\s*\n\s*contents: read/.test(workflow), 'GitHub token must be read-only');
assert.ok(/cancel-in-progress: false/.test(workflow), 'production deploy must never be cancelled mid-flight');
assert.ok(!/sshpass\s+-p/.test(workflow), 'secure deploy workflow must not invoke password SSH directly');
assert.ok(!/StrictHostKeyChecking=no/.test(workflow), 'secure deploy workflow must not disable host verification directly');
assert.ok((workflow.match(/scripts\/deploy-ssh\.sh/g) || []).length >= 8, 'all server transport must go through deploy-ssh helper');
assert.ok(/FILE_SIGNING_KEY_PRESENT=yes/.test(fs.readFileSync('scripts/remote_bootstrap_secure_env.sh', 'utf8')), 'production bootstrap must verify signing-key presence');

console.log('deploy SSH security guard OK: pinned host key, fail-closed key mode, secret-safe transport, production workflow uses helper');
