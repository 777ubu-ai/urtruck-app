import {
  createHmac, randomBytes, scryptSync, timingSafeEqual
} from 'node:crypto';
import {
  chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { isStaffRole, type StaffRole } from './rbac';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PASSWORD_BYTES = 64;

export type StaffRecord = {
  username: string;
  passwordSalt: string;
  passwordHash: string;
  role: StaffRole;
  totpSecret: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  mfaEnrolledAt?: string;
};

type Store = { version: 1; users: StaffRecord[] };

function storePath() {
  return join(process.cwd(), '.admin-data', 'staff.json');
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._@-]/g, '').slice(0, 80);
}

function readStore(): Store {
  const path = storePath();
  if (!existsSync(path)) return { version: 1, users: [] };
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Store;
  if (parsed?.version !== 1 || !Array.isArray(parsed.users)) throw new Error('invalid_staff_store');
  return parsed;
}

function writeStore(store: Store) {
  const path = storePath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
  chmodSync(path, 0o600);
}

function hashPassword(password: string, saltB64: string) {
  const salt = Buffer.from(saltB64, 'base64');
  return scryptSync(password, salt, PASSWORD_BYTES, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('base64');
}

function passwordFields(password: string) {
  const salt = randomBytes(16).toString('base64');
  return { passwordSalt: salt, passwordHash: hashPassword(password, salt) };
}

function passwordOk(record: StaffRecord, password: string) {
  const actual = Buffer.from(hashPassword(password, record.passwordSalt), 'base64');
  const expected = Buffer.from(record.passwordHash, 'base64');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function base32Encode(input: Buffer) {
  let bits = 0, value = 0, out = '';
  for (const byte of input) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(value: string) {
  let bits = 0, buffer = 0;
  const out: number[] = [];
  for (const char of value.toUpperCase().replace(/=|\s|-/g, '')) {
    const idx = BASE32.indexOf(char); if (idx < 0) continue;
    buffer = (buffer << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((buffer >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function totpAt(secret: string, timestampMs: number) {
  const counter = Math.floor(timestampMs / 30_000);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTotp(secret: string, code: string) {
  const normalized = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const given = Buffer.from(normalized);
  for (const drift of [-1, 0, 1]) {
    const expected = Buffer.from(totpAt(secret, Date.now() + drift * 30_000));
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

export function provisioningUri(record: Pick<StaffRecord, 'username' | 'totpSecret'>) {
  const label = encodeURIComponent(`UrTruck:${record.username}`);
  return `otpauth://totp/${label}?secret=${record.totpSecret}&issuer=UrTruck&algorithm=SHA1&digits=6&period=30`;
}

export function staffCount() { return readStore().users.length; }

export function findStaff(username: string) {
  const normalized = normalizeUsername(username);
  return readStore().users.find((user) => user.username === normalized) || null;
}

export function verifyStaffPassword(username: string, password: string) {
  const record = findStaff(username);
  if (!record || !passwordOk(record, password)) return null;
  return record;
}

export function createStaff(username: string, password: string, role: StaffRole) {
  const normalized = normalizeUsername(username);
  if (normalized.length < 3) throw new Error('invalid_username');
  if (password.length < 12) throw new Error('password_too_short');
  if (!isStaffRole(role)) throw new Error('invalid_role');
  const store = readStore();
  if (store.users.some((user) => user.username === normalized)) throw new Error('staff_exists');
  const now = new Date().toISOString();
  const record: StaffRecord = {
    username: normalized, ...passwordFields(password), role,
    totpSecret: base32Encode(randomBytes(20)), active: false,
    createdAt: now, updatedAt: now
  };
  store.users.push(record); writeStore(store); return record;
}

export function bootstrapOwner(username: string, password: string) {
  const store = readStore();
  if (store.users.length > 0) return null;
  return createStaff(username, password, 'owner');
}

export function resetOwnerPassword(username: string, password: string) {
  if (password.length < 12) throw new Error('password_too_short');
  const store = readStore();
  const record = store.users.find((user) => user.username === normalizeUsername(username) && user.role === 'owner');
  if (!record) throw new Error('owner_not_found');
  Object.assign(record, passwordFields(password));
  record.active = true; record.updatedAt = new Date().toISOString();
  writeStore(store); return record;
}

export function activateStaffPasswordOnly(username: string) {
  const store = readStore();
  const record = store.users.find((user) => user.username === normalizeUsername(username));
  if (!record) return null;
  record.active = true; record.updatedAt = new Date().toISOString(); record.lastLoginAt = record.updatedAt;
  writeStore(store); return record;
}

export function activateStaff(username: string, code: string) {
  const store = readStore();
  const record = store.users.find((user) => user.username === normalizeUsername(username));
  if (!record || !verifyTotp(record.totpSecret, code)) return null;
  record.active = true; record.updatedAt = new Date().toISOString(); record.lastLoginAt = record.updatedAt; record.mfaEnrolledAt = record.updatedAt;
  writeStore(store); return record;
}

export function verifyStaffLogin(username: string, password: string, code: string) {
  const store = readStore();
  const record = store.users.find((user) => user.username === normalizeUsername(username));
  if (!record || !record.active || !passwordOk(record, password) || !verifyTotp(record.totpSecret, code)) return null;
  record.lastLoginAt = new Date().toISOString(); record.updatedAt = record.lastLoginAt;
  writeStore(store); return record;
}

export function listStaff() {
  return readStore().users.map(({ passwordHash: _h, passwordSalt: _s, totpSecret: _t, ...safe }) => safe);
}

export function setStaffActive(username: string, active: boolean) {
  const store = readStore();
  const record = store.users.find((user) => user.username === normalizeUsername(username));
  if (!record) throw new Error('staff_not_found');
  if (active && !record.mfaEnrolledAt) throw new Error('mfa_not_enrolled');
  if (!active && record.role === 'owner') {
    const otherOwner = store.users.some((u) => u.username !== record.username && u.role === 'owner' && u.active);
    if (!otherOwner) throw new Error('last_owner');
  }
  record.active = active; record.updatedAt = new Date().toISOString(); writeStore(store);
  return record;
}
