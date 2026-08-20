// test_border_lookup_locale — PR #255 review, latest owner instruction item 1:
// "закрыть raw status/checkpoint в Border lookup".
//
// GET /borders/lookup (backend/cgr/booking_service.py::lookup_by_plate) scrapes
// CGR's public registry HTML and returns two Russian-only fields verbatim:
//   * status_raw — the raw scraped text, e.g. "В очереди", "Вызван"
//   * checkpoint — the raw scraped compound checkpoint name
// alongside a normalized, finite `status` code (backend/cgr/parsers.py's
// _STATUS_MAP: in_queue/called/crossed/revoked/payment/not_paid/validating/
// review_failed/unknown). QueueScreenLazyV2.js's plate-check panel rendered
// `status_raw || status` and `checkpoint` raw, so every non-RU user saw
// scraped Russian regardless of their selected language. This locks in the
// fix: the panel must render through a per-locale status map and the shared
// checkpoint localizer, never the raw scraped strings.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SRC = fs.readFileSync('src/screens/QueueScreenLazyV2.js', 'utf8');
const CYRILLIC = /[А-Яа-яЁё]/;
const CJK = /[㐀-䶿一-鿿]/;

// The exact status codes backend/cgr/parsers.py's _STATUS_MAP normalizes to,
// plus the "unknown" catch-all normalize_status() falls back to.
const BACKEND_STATUS_CODES = [
  'in_queue', 'called', 'crossed', 'revoked', 'payment',
  'not_paid', 'validating', 'review_failed', 'unknown',
];

test('the lookup panel no longer renders the raw scraped status_raw field', () => {
  assert.doesNotMatch(
    SRC,
    /lookup\.status_raw/,
    'status_raw is CGR-scraped Russian text and must not reach the UI; render lookup.status through a locale map instead',
  );
});

test('the lookup panel renders checkpoint through the shared canonical localizer, not raw', () => {
  assert.doesNotMatch(
    SRC,
    /\{L\.checkpoint\}:\s*\{lookup\.checkpoint\}/,
    'lookup.checkpoint must not be interpolated raw — it is CGR-scraped Russian text',
  );
  assert.match(
    SRC,
    /localizeCheckpointName\(lookup\.checkpoint,\s*lang\)/,
    'lookup.checkpoint must be passed through localizeCheckpointName(…, lang)',
  );
});

test('LOOKUP_STATUS covers every backend status code in all four locales', () => {
  const match = SRC.match(/const LOOKUP_STATUS = \{([\s\S]*?)\n\};/);
  assert.ok(match, 'LOOKUP_STATUS map not found in QueueScreenLazyV2.js');
  const block = match[1];
  for (const code of BACKEND_STATUS_CODES) {
    const entryMatch = block.match(new RegExp(`\\b${code}:\\s*\\{([^}]*)\\}`));
    assert.ok(entryMatch, `LOOKUP_STATUS is missing backend code "${code}"`);
    const entry = entryMatch[1];
    for (const lang of ['RU', 'KK', 'EN', 'ZH']) {
      const valueMatch = entry.match(new RegExp(`${lang}:\\s*'([^']*)'`));
      assert.ok(valueMatch && valueMatch[1].trim().length > 1,
        `LOOKUP_STATUS.${code} is missing a real ${lang} label`);
    }
  }
});

test('LOOKUP_STATUS: EN labels contain no Cyrillic, ZH labels use Chinese, KK labels are not raw Russian', () => {
  const match = SRC.match(/const LOOKUP_STATUS = \{([\s\S]*?)\n\};/);
  const block = match[1];
  for (const code of BACKEND_STATUS_CODES) {
    const entryMatch = block.match(new RegExp(`\\b${code}:\\s*\\{([^}]*)\\}`));
    const entry = entryMatch[1];
    const get = (lang) => entry.match(new RegExp(`${lang}:\\s*'([^']*)'`))[1];
    const ru = get('RU');
    const kk = get('KK');
    const en = get('EN');
    const zh = get('ZH');
    assert.ok(!CYRILLIC.test(en), `LOOKUP_STATUS.${code}.EN still Cyrillic: ${en}`);
    assert.ok(CJK.test(zh), `LOOKUP_STATUS.${code}.ZH is not Chinese: ${zh}`);
    // A correct short Kazakh word can legitimately have no ӘҒҚҢӨҰҮҺІ letter
    // (e.g. "Кезекте" — locative of "кезек", queue). The real signal for a
    // raw-Russian fallback is identity with the Russian string, not the
    // absence of a diacritic.
    assert.notEqual(kk, ru, `LOOKUP_STATUS.${code}.KK is a verbatim copy of RU`);
  }
});

test('lookupStatusLabel() falls back to RU (never throws) for a code outside the map', () => {
  // Guard against a future CGR status the parser hasn't been taught yet.
  assert.match(SRC, /function lookupStatusLabel\(code, lang\)/);
  assert.match(SRC, /LOOKUP_STATUS\[code\] \|\| LOOKUP_STATUS\.unknown/,
    'lookupStatusLabel must fall back to the "unknown" entry for an unmapped code');
});

test('the render call site passes the live lang, not a hardcoded locale', () => {
  assert.match(
    SRC,
    /lookupStatusLabel\(lookup\.status,\s*lang\)/,
    'the lookup status render must pass the current lang through lookupStatusLabel',
  );
});
