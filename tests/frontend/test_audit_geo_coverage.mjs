import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTRY_ORDER, POINTS, pointsForCountry, searchPoints } from '../../src/utils/geography.js';
import { customCityForCountry } from '../../src/utils/worldCities.js';

test('every selectable country has a directory or an explicit country-bound manual path', () => {
  let covered = 0;
  for (const country of COUNTRY_ORDER) {
    const points = pointsForCountry(country, 'city');
    if (points.length) covered++;
    const manual = customCityForCountry('QA settlement', country);
    assert.equal(manual.country, country);
    assert.equal(manual.type, 'city');
    assert.equal(manual.name, 'QA settlement');
    assert.ok(points.every(p => p.country === country));
  }
  assert.ok(covered >= 240, `city coverage ${covered}`);
});

test('global city search stays in the selected country and supports Russian aliases', () => {
  for (const [country, query] of [['DE','Berlin'],['BE','Brussels'],['NL','Amsterdam'],['FR','Paris'],['IN','Mumbai'],['US','New York']]) {
    const hits = searchPoints(query, { country, type: 'city' });
    assert.ok(hits.length, `${country} ${query}`);
    assert.ok(hits.every(p => p.country === country));
  }
  assert.ok(searchPoints('Берлин', {country:'DE'}).length);
  assert.equal(searchPoints('Berlin', {country:'BE'}).length, 0);
});

test('approved corridor points retain their labels, order and identity', () => {
  for (const country of ['CN','KZ','RU','PL']) {
    const curated = POINTS.filter(p => p.country === country || p.partnerCountry === country);
    assert.deepEqual(pointsForCountry(country).slice(0, curated.length), curated);
  }
});

test('search preserves the approved city without an alias duplicate',()=>{
  const hits=searchPoints('Алматы',{country:'KZ',type:'city'});
  assert.equal(hits.filter(p=>p.name==='Алматы'||p.name==='Almaty').length,1);
  assert.equal(hits[0].name,'Алматы');
});
