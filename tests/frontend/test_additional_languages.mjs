import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import translations from '../../src/utils/i18n.js';
import { LANGUAGES, ADDITIONAL_LANGUAGE_CODES, localeForLanguage } from '../../src/utils/languages.js';
import { ADDITIONAL_TRANSLATIONS, withAdditionalLanguages, localizeUiTemplate } from '../../src/utils/additionalLocales.js';
import { getVehicleCopy } from '../../src/utils/vehicleSetupCopy.js';
import { getExpenseCopy } from '../../src/utils/expenseCopy.js';

const marks = text => [...text.matchAll(/\{\{[^{}]+\}\}|\$\{[^{}]+\}|\{[^{}]+\}|%[sdif]/g)].map(x => x[0]).sort();
const links = text => [...text.matchAll(/https?:\/\/[^\s)]+/g)].map(x => x[0]).sort();
const loadCatalog = code => JSON.parse(fs.readFileSync(`src/utils/locales/${code.toLowerCase()}.js`, 'utf8').replace(/^export default /, '').replace(/;\s*$/, ''));

test('девять языков используют ISO-коды языка и правильные страны флагов', () => {
  assert.deepEqual(LANGUAGES.map(x => x.code).sort(), ['RU','KK','EN','ZH','TR','UZ','KY','TG','BE'].sort());
  for (const [code, country] of [['KY','KG'],['TG','TJ'],['BE','BY'],['KK','KZ'],['ZH','CN']]) assert.equal(LANGUAGES.find(x => x.code === code).country, country);
  for (const item of LANGUAGES) assert.ok(item.label && item.locale && translations[item.code]);
  assert.equal(localeForLanguage('KY'), 'ky-KG');
});

test('все новые общие словари полны, без пустых значений и потери подстановок/ссылок', () => {
  const keys = Object.keys(translations.RU).sort();
  for (const code of ADDITIONAL_LANGUAGE_CODES) {
    assert.deepEqual(Object.keys(translations[code]).sort(), keys, code);
    for (const key of keys) {
      const value = translations[code][key];
      assert.equal(typeof value, 'string', `${code}.${key}`);
      assert.ok(value.trim(), `${code}.${key}`);
      assert.deepEqual(marks(value), marks(translations.RU[key]), `${code}.${key} placeholders`);
      assert.deepEqual(links(value), links(translations.RU[key]), `${code}.${key} links`);
    }
  }
});

test('локальные словари также полны; прежние объекты не меняются', () => {
  const phraseKeys = Object.keys(loadCatalog('TR').phrases).sort();
  assert.ok(phraseKeys.length > 800);
  for (const code of ADDITIONAL_LANGUAGE_CODES) {
    const phrases = loadCatalog(code).phrases;
    assert.deepEqual(Object.keys(phrases).sort(), phraseKeys, code);
    for (const key of phraseKeys) {
      assert.ok(phrases[key].trim(), `${code}: ${key}`);
      assert.deepEqual(marks(phrases[key]), marks(key), `${code}: ${key}`);
      assert.deepEqual(links(phrases[key]), links(key), `${code}: ${key}`);
    }
    const vehicle = getVehicleCopy(code), expense = getExpenseCopy(code);
    assert.deepEqual(Object.keys(vehicle).sort(), Object.keys(getVehicleCopy('RU')).sort(), code);
    assert.deepEqual(Object.keys(expense).sort(), Object.keys(getExpenseCopy('RU')).sort(), code);
    assert.notEqual(expense.save, getExpenseCopy('RU').save, code);
  }
  const original = { RU: { save: 'Сохранить', nested: ['Отмена'] }, EN: { save: 'Save', nested: ['Cancel'] } };
  const before = JSON.stringify(original), expanded = withAdditionalLanguages(original);
  assert.equal(JSON.stringify(original), before);
  assert.equal(expanded.RU, original.RU);
  assert.equal(expanded.EN, original.EN);
});

function boot({ saved, system }) {
  const values = new Map(saved ? [['ur_lang', saved]] : []);
  const source = fs.readFileSync('src/utils/i18n.js', 'utf8').replace(/^import .*;\n/gm, '').replace(/export default translations;/, '').replace(/export /g, '');
  const ctx = {
    ADDITIONAL_TRANSLATIONS, localizeCargoName: x => x,
    navigator: { language: system }, document: { documentElement: {} },
    require: name => name === './storage' ? { storage: { get: async key => values.get(key), set: (key, value) => values.set(key, value) } } : { Platform: { OS: 'web' } },
  };
  vm.runInNewContext(source + '\nglobalThis.api = { getLanguage, setLanguage, t, subscribeToLanguage };', ctx);
  return { ctx, values };
}

test('выбор каждого нового языка сохраняется, меняет тексты и HTML lang', async () => {
  for (const code of ADDITIONAL_LANGUAGE_CODES) {
    const { ctx, values } = boot({ system: 'ru-RU' });
    await new Promise(resolve => setImmediate(resolve));
    const heard = [], unsubscribe = ctx.api.subscribeToLanguage(value => heard.push(value));
    ctx.api.setLanguage(code);
    assert.equal(ctx.api.getLanguage(), code);
    assert.equal(values.get('ur_lang'), code);
    assert.equal(ctx.api.t('language_label'), translations[code].language_label);
    assert.equal(ctx.document.documentElement.lang, code.toLowerCase());
    assert.deepEqual(heard, [code]); unsubscribe();
    const restored = boot({ saved: code, system: 'ru-RU' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(restored.ctx.api.getLanguage(), code);
  }
});

test('автоопределение и legacy country aliases не сбрасывают выбранный язык', async () => {
  for (const [system, expected] of [['tr-TR','TR'],['uz-Latn-UZ','UZ'],['ky-KG','KY'],['tg-TJ','TG'],['be-BY','BE']]) {
    const { ctx } = boot({ system }); await new Promise(resolve => setImmediate(resolve));
    assert.equal(ctx.api.getLanguage(), expected, system);
  }
  for (const [saved, expected] of [['KZ','KK'],['CN','ZH'],['KG','KY'],['TJ','TG'],['BY','BE']]) {
    const { ctx } = boot({ saved, system: 'en-US' }); await new Promise(resolve => setImmediate(resolve));
    assert.equal(ctx.api.getLanguage(), expected, saved);
  }
});

test('динамические числа не теряются при переводе времени предложения', () => {
  for (const code of ADDITIONAL_LANGUAGE_CODES) {
    const value = localizeUiTemplate(['Осталось ', ' д ', ' ч'], [2, 7], code);
    assert.match(value, /2/); assert.match(value, /7/); assert.doesNotMatch(value, /_v\d/);
  }
});

test('реальный formatter маршрута сохраняет прежние локали и переводит часы/минуты новых', () => {
  const source = fs.readFileSync('src/components/TripRoutePanel.js', 'utf8');
  const start = source.indexOf('const formatDuration =');
  const end = source.indexOf('\n};', start) + 3;
  const context = { ADDITIONAL_TRANSLATIONS };
  vm.runInNewContext(source.slice(start, end) + '\nthis.format = formatDuration;', context);
  assert.equal(context.format(3780, 'RU'), '1 ч. 3 мин.');
  assert.equal(context.format(3780, 'KK'), '1 ч. 3 мин.');
  assert.equal(context.format(3780, 'EN'), '1 h 3 min');
  assert.equal(context.format(3780, 'ZH'), '1小时 3分');
  for (const code of ADDITIONAL_LANGUAGE_CODES) {
    assert.notEqual(context.format(3780, code), '1 ч. 3 мин.', code);
    assert.ok(context.format(3780, code).includes(ADDITIONAL_TRANSLATIONS[code].time_hour));
    assert.ok(context.format(3780, code).includes(ADDITIONAL_TRANSLATIONS[code].time_min));
    assert.equal(context.format(-1, code), null);
  }
});

test('турецкие и узбекские кнопки/подписи не содержат случайных русских фрагментов', () => {
  for (const code of ['TR', 'UZ']) {
    for (const [key, value] of Object.entries(translations[code])) assert.doesNotMatch(value, /[А-Яа-яЁё]/, `${code}.${key}`);
  }
  const onboarding = fs.readFileSync('src/screens/onboarding/OnboardingV2Screen.js', 'utf8');
  assert.match(onboarding, /languageBar:.*alignItems: 'flex-end'/);
  const picker = fs.readFileSync('src/components/LanguageSwitcher.js', 'utf8');
  assert.match(picker, /aria-checked=\{active\}/);
  assert.match(picker, /minHeight: 44/);
});

test('известные системные сообщения сделки переводятся, текст участников остаётся исходным', async () => {
  const { localizeSystemMessage } = await import('../../src/utils/places.js');
  const source = fs.readFileSync('src/utils/places.js', 'utf8');
  const start = source.indexOf('const SYSTEM_MESSAGE_DICT =');
  const end = source.indexOf('\n};', start) + 3;
  const context = {};
  vm.runInNewContext(source.slice(start, end) + '\nthis.messages=SYSTEM_MESSAGE_DICT;', context);
  for (const code of ADDITIONAL_LANGUAGE_CODES) {
    for (const raw of Object.keys(context.messages)) {
      assert.notEqual(localizeSystemMessage(raw, code), raw, `${code}: ${raw}`);
      const withAmount = localizeSystemMessage(raw + ' · 1100 USD', code);
      assert.ok(withAmount.endsWith(' · 1100 USD'), code);
      assert.notEqual(withAmount, raw + ' · 1100 USD', code);
    }
    for (const raw of ['Мой груз: цемент, 20 тонн', 'Сохранить', 'Давайте завершим сделку завтра']) assert.equal(localizeSystemMessage(raw, code), raw, code);
  }
});
