import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCargoShareText, buildPublicCargoShare, publicCargoShareUrl } from '../../src/utils/share.js';

const cargo = {
  id: '0f6d6f54-9d2f-4ec9-93b2-1b58e6462d61',
  status: 'active',
  from: 'Иу',
  to: 'Алматы',
  cargoDesc: 'Электроника\n<script>alert(1)</script>',
  weightTons: 10,
  volumeM3: 82,
  truckType: 'tent',
  pickupDate: '2026-10-05',
  price: 1500,
  currency: 'USD',
};

test('public cargo share is localized, has one labelled URL and normalizes hostile whitespace', () => {
  const shared = buildPublicCargoShare(cargo, 'https://qa2.urtruck.kz/', 'RU');
  assert.ok(shared);
  assert.equal(shared.url, 'https://qa2.urtruck.kz/cargos/0f6d6f54-9d2f-4ec9-93b2-1b58e6462d61');
  assert.match(shared.text, /^UrTruck груз\nИу → Алматы/m);
  assert.match(shared.text, /Смотреть груз: https:\/\/qa2\.urtruck\.kz\/cargos\//);
  assert.equal((shared.text.match(/https:\/\/qa2\.urtruck\.kz/g) || []).length, 1);
  assert.match(shared.text, /Электроника <script>alert\(1\)<\/script>/);
  assert.doesNotMatch(shared.text, /\n<script>/);

  const zh = buildPublicCargoShare(cargo, 'https://qa2.urtruck.kz', 'ZH');
  const en = buildPublicCargoShare(cargo, 'https://qa2.urtruck.kz', 'EN');
  assert.match(zh.text, /UrTruck 货物/);
  assert.match(zh.text, /查看货物:/);
  assert.match(en.text, /UrTruck cargo/);
  assert.match(en.text, /View cargo:/);
});

test('share URL is fail-closed outside approved public origins', () => {
  assert.equal(publicCargoShareUrl('', cargo.id), '');
  assert.equal(publicCargoShareUrl('https://example.invalid', cargo.id), '');
  assert.equal(publicCargoShareUrl('http://qa2.urtruck.kz', cargo.id), '');
  assert.equal(publicCargoShareUrl('https://urtruck.kz.evil.test', cargo.id), '');
  assert.equal(buildPublicCargoShare(cargo, '', 'RU'), null);
});

test('closed and technical QA records cannot be exported as public cargo copy', () => {
  assert.equal(buildPublicCargoShare({ ...cargo, status: 'taken' }, 'https://qa2.urtruck.kz', 'RU'), null);
  assert.equal(buildPublicCargoShare({ ...cargo, cargoDesc: 'QA2 PUSH E2E versionCode 211040091' }, 'https://qa2.urtruck.kz', 'RU'), null);
  const publicText = buildCargoShareText(cargo, 'https://qa2.urtruck.kz/cargos/x', 'RU');
  assert.equal((publicText.match(/https:\/\/qa2\.urtruck\.kz/g) || []).length, 1);
});
