// Release-hardening track 2, item 3: IS_BETA canonicalization.
//
// Root cause: src/config/supabase.js used to compute IS_BETA independently
// of src/config/env.js — supabase.js defaulted to `true` UNCONDITIONALLY
// (no APP_ENV/production check at all), while env.js correctly defaults to
// `false` specifically when APP_ENV === 'production'. Since eas.json's
// production build profile never sets EXPO_PUBLIC_IS_BETA, supabase.js's
// IS_BETA (the one ProfileScreen.js actually imports) silently resolved to
// `true` in a real production build — showing the beta-pricing note to
// paying production users — while env.js's IS_BETA (unused by anyone)
// correctly resolved to `false` for that exact same build. Two sources of
// truth disagreeing specifically in production was the ambiguity.
//
// Fix: supabase.js now re-exports env.js's IS_BETA instead of recomputing
// it — single canonical source. This test proves both the runtime
// equivalence (in whatever environment this test itself runs under) and,
// via source assertions, that the duplicate computation cannot silently
// return.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as env from '../../src/config/env.js';
import * as supabaseConfig from '../../src/config/supabase.js';

test('supabase.js.IS_BETA is the exact same value as env.js.IS_BETA (single source of truth)', () => {
  assert.equal(typeof env.IS_BETA, 'boolean');
  assert.equal(supabaseConfig.IS_BETA, env.IS_BETA,
    'supabase.js must no longer compute IS_BETA independently — a divergence here means the duplicate came back');
});

test('supabase.js re-exports IS_BETA from env.js, never redefines it independently', () => {
  const src = readFileSync('src/config/supabase.js', 'utf8');
  assert.match(src, /import\s*\{\s*IS_BETA(?:\s+as\s+\w+)?\s*\}\s*from\s*['"]\.\/env['"]/,
    'supabase.js must import IS_BETA from ./env (the canonical source)');
  assert.doesNotMatch(src, /process\.env\.EXPO_PUBLIC_IS_BETA/,
    'supabase.js must not read EXPO_PUBLIC_IS_BETA itself — that belongs to env.js alone now');
  assert.doesNotMatch(src, /_envBeta/,
    'the old independent computation (the actual bug) must not reappear under any name');
});

test('env.js remains the environment-aware default: production means IS_BETA=false unless explicitly overridden', () => {
  const src = readFileSync('src/config/env.js', 'utf8');
  assert.match(src, /IS_BETA\s*=\s*BETA_OVERRIDE\s*===\s*undefined\s*\n?\s*\?\s*APP_ENV\s*!==\s*'production'/,
    "env.js's default (no override) must stay tied to APP_ENV !== 'production' — this is exactly what the old supabase.js copy lacked");
  assert.match(src, /APP_ENV === 'production' && IS_BETA/,
    'the production+IS_BETA fatal-log guard must still exist (regression protection)');
});
