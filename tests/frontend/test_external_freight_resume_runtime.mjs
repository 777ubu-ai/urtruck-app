import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as model from '../../src/utils/externalFreightModel.js';
// Проверяем реальный resolver с явно заданным публичным release origin.
const previousPublicOrigin = process.env.EXPO_PUBLIC_WEB_URL;
process.env.EXPO_PUBLIC_WEB_URL = 'https://urtruck.kz';
const env = await import('../../src/config/env.js?ios110-release-contract');
if (previousPublicOrigin === undefined) delete process.env.EXPO_PUBLIC_WEB_URL;
else process.env.EXPO_PUBLIC_WEB_URL = previousPublicOrigin;
import * as share from '../../src/utils/externalFreightShare.js';
import * as contact from '../../src/utils/externalFreightContact.js';
const require = createRequire(import.meta.url);
const babel = require('@babel/core');
const code = babel.transformSync(readFileSync('src/screens/ExternalFreightFeedScreen.js', 'utf8'), {
  babelrc: false, configFile: false,
  plugins: [require('@babel/plugin-transform-react-jsx'), require('@babel/plugin-transform-modules-commonjs')],
}).code;
const stamp = '2026-10-23T10:00:00Z';
const cards = Array.from({ length: 60 }, (_, i) => ({ id: String(100 - i), status: 'active', source_published_at: stamp, original_text: 'Исходный текст', contacts: [], body_types: [] }));
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness({ role = 'driver', fixtures = cards, platform = 'android' } = {}) {
  const opened = [], copied = [];
  const slots = [], pending = [], listeners = new Map(), intervals = new Map(), queries = [];
  let cursor = 0, dirty = true, tree, appCallback, calls = 0, fail = false, suspended = false, resolvePending, filterOffset = 0;
  let elapsed = 0;
  const depsEqual = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const React = {
    createElement: (type, props, ...children) => {
      if (type === 'ScrollView' && props?.horizontal && props.ref) props.ref.current = { scrollTo: ({ x }) => { filterOffset = x; } };
      return { type, props: { ...props, children } };
    },
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[i].value, value => { const next = typeof value === 'function' ? value(slots[i].value) : value; if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true; } }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useMemo(fn, deps) { const i = cursor++; if (!slots[i] || !depsEqual(slots[i].deps, deps)) slots[i] = { deps, value: fn() }; return slots[i].value; },
    useCallback(fn, deps) { return React.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !depsEqual(slots[i].deps, deps)) { slots[i]?.cleanup?.(); slots[i] = { deps }; pending.push(() => { slots[i].cleanup = fn(); }); } },
  };
  const navigation = { isFocused: () => true, addListener: (name, fn) => { listeners.set(name, fn); return () => listeners.delete(name); }, goBack() {} };
  const native = Object.fromEntries(['ActivityIndicator', 'FlatList', 'Modal', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'TouchableOpacity', 'View'].map(name => [name, name]));
  native.Platform = { OS: platform }; native.StyleSheet = { create: x => x, hairlineWidth: 1 };
  native.AppState = { currentState: 'active', addEventListener: (_name, fn) => { appCallback = fn; return { remove() {} }; } };
  native.BackHandler = { addEventListener: () => ({ remove() {} }) };
  native.Keyboard = { dismiss() {} };
  native.PanResponder = { create: config => ({ panHandlers: config }) };
  native.Alert = { alert() {} }; native.Linking = { openURL: async url => { opened.push(url); } };
  const mocks = {
    react: React, 'react-native': native, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@expo/vector-icons/Feather': 'Feather', '@expo/vector-icons/FontAwesome5': 'FontAwesome5',
    '../theme/designV1': { useV1Colors: () => ({}) }, 'expo-clipboard': { setStringAsync: async value => { copied.push(value); } },
    '../components/externalFreight/ExternalFeedDatePicker': 'DatePicker', '../components/ui/v1/BookmarkButton': 'BookmarkButton',
    '../components/ui/v1/PrimaryButton': 'PrimaryButton', '../components/ui/actions/SecondaryButton': 'SecondaryButton',
    '../components/externalFreight/CarrierDirectory': 'CarrierContactCard', '../components/externalFreight/ExternalFeedDescription': 'Description', '../components/ShareModal': 'ShareModal',
    '../config/env': env, '../utils/externalFreightShare': share, '../utils/externalFreightContact': contact,
    '../components/Toast': { useToast: () => ({ toast() {} }) }, '../utils/useI18n': { useI18n: () => ({ lang: 'RU', sp: n => n, t: x => x }) },
    '../utils/ThemeContext': { useTheme: () => ({ theme: {} }) }, '../utils/AuthContext': { useAuth: () => ({ session: { user: { id: 'test-' + role, role } } }) },
    '../utils/externalFreightSession': { sessionRole: () => role }, '../utils/truckConstants': { BODY_TYPES: [] },
    '../utils/countries': { ALL_COUNTRIES: [], getCountryName: x => x }, '../utils/externalFreightModel': model,
    '../utils/externalFreightFeed': { externalFreightAPI: { event() {}, async list(query) {
      calls++;
      queries.push(query);
      if (suspended) await new Promise(resolve => { resolvePending = resolve; });
      if (fail) return { ok: false, error: 'network_error' };
      return { ok: true, items: query.cursor ? fixtures.slice(30) : fixtures.slice(0, 30), next_cursor: query.cursor ? 'older-page' : 'page2' };
    } } },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { exports: module.exports, module, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, AbortController, Map, Set, Date, console, setTimeout, clearTimeout,
    setInterval: (fn, delay) => { intervals.set(fn, { delay, next: elapsed + delay }); return fn; }, clearInterval: fn => intervals.delete(fn) });
  function render() { cursor = 0; dirty = false; tree = module.exports.default({ navigation }); pending.splice(0).forEach(fn => fn()); }
  function nodes() { const all = []; function walk(n) { if (Array.isArray(n)) return n.forEach(walk); if (!n?.props || (n.type === 'Modal' && !n.props.visible)) return; all.push(n); walk(n.props.children); } walk(tree); return all; }
  return {
    async flush() { for (let i = 0; i < 12; i++) { if (dirty) render(); await tick(); } },
    list: () => nodes().find(n => n.type === 'FlatList'), warning: () => nodes().find(n => n.type === 'TouchableOpacity' && n.props.children.some(c => c?.type === 'Text' && c.props.children.some(s => typeof s === 'string' && s.includes('Нет соединения')))),
    focus: () => listeners.get('focus')?.(), blur: () => listeners.get('blur')?.(), app: state => { native.AppState.currentState = state; appCallback(state); },
    resume: () => { listeners.get('blur')?.(); listeners.get('focus')?.(); }, intervals: () => [...intervals.values()].map(timer => timer.delay),
    advance(ms) {
      const end = elapsed + ms;
      while (intervals.size) {
        const next = Math.min(...[...intervals.values()].map(timer => timer.next));
        if (next > end) break;
        elapsed = next;
        for (const [fn, timer] of intervals) if (timer.next === next) { timer.next += timer.delay; fn(); }
      }
      elapsed = end;
    },
    fail: value => { fail = value; }, suspend: () => { suspended = true; }, release: () => { suspended = false; resolvePending?.(); }, calls: () => calls,
    node: id => nodes().find(n => n.props.testID === id), filterOffset: value => value === undefined ? filterOffset : (filterOffset = value), pressLabel: label => nodes().find(n => n.props.label === label).props.onPress(),
    shareModal: () => nodes().find(n => n.type === 'ShareModal'),
    opened, copied, renderItem: item => nodes().find(n => n.type === 'FlatList').props.renderItem({ item }),
    queries, saved: () => nodes().find(n => n.props.testID === 'external-feed-saved-only').props.onPress(),
  };
}

for (const role of ['driver', 'client']) for (const platform of ['android', 'ios', 'web']) test(`${role}/${platform}: лента не опрашивает сервер по таймеру, ручное обновление сразу`, async () => {
  const h = harness({ role, platform }); await h.flush();
  assert.deepEqual(h.intervals(), []);
  const initial = h.calls();
  h.advance(600000); await h.flush();
  assert.equal(h.calls(), initial, 'за 10 минут простоя нет повторных запросов');
  h.list().props.onRefresh(); await h.flush();
  assert.equal(h.calls(), initial + 1);
});
test('скрытая лента не запрашивает сервер, возврат обновляет сразу', async () => {
  const h = harness(); await h.flush();
  for (const state of ['background', 'inactive']) {
    h.app(state); const before = h.calls();
    h.advance(120000); await h.flush(); assert.equal(h.calls(), before);
    h.app('active'); await h.flush(); assert.equal(h.calls(), before + 1);
  }
  h.blur(); const before = h.calls();
  h.advance(120000); await h.flush(); assert.equal(h.calls(), before);
  h.focus(); await h.flush(); assert.equal(h.calls(), before + 1);
});

test('равные даты: фоновые первые30 сохраняют ранее загруженные60 и обновляют поля', () => {
  const result = model.mergeLiveFeed(cards, cards.slice(0, 30).map(x => ({ ...x, amount: 500 })), { hasMore: true });
  assert.deepEqual(result.map(x => x.id), cards.map(x => x.id));
  assert.equal(result[0].amount, 500);
});
test('хвост не воскрешает закрытую/истёкшую запись и исчезает при полном снимке', () => {
  const current = [...cards.slice(0, 30), { ...cards[30], status: 'closed' }, { ...cards[31], expires_at: '2020-01-01' }, ...cards.slice(32)];
  const result = model.mergeLiveFeed(current, cards.slice(0, 30), { hasMore: true });
  assert.equal(result.length, 58); assert.ok(!result.some(x => x.id === cards[30].id || x.id === cards[31].id));
  assert.equal(model.mergeLiveFeed(cards, cards.slice(0, 20), { hasMore: false }).length, 20);
});
for (const mode of ['focus', 'AppState']) test(`возврат ${mode}: настоящие callbacks сохраняют строку51 и cursor следующей страницы`, async () => {
  const h = harness(); await h.flush(); h.list().props.onEndReached(); await h.flush();
  assert.equal(h.list().props.data.length, 60);
  const anchor = h.list().props.data[50].id;
  h.list().props.onScroll({ nativeEvent: { contentOffset: { y: 1200 }, contentSize: { height: 6000 }, layoutMeasurement: { height: 700 } } });
  if (mode === 'focus') { h.blur(); h.focus(); } else { h.app('background'); h.app('active'); }
  await h.flush();
  assert.equal(h.list().props.data.length, 60);
  assert.equal(h.list().props.data[50].id, anchor);
  assert.equal(h.list().props.maintainVisibleContentPosition.minIndexForVisible, 0);
});
for (const mode of ['focus', 'AppState']) test(`сохранённые: ${mode} сохраняет60 и следующий запрос продолжает после них`, async () => {
  const h = harness(); await h.flush(); h.saved(); await h.flush();
  h.list().props.onEndReached(); await h.flush(); assert.equal(h.list().props.data.length, 60);
  if (mode === 'focus') { h.blur(); h.focus(); } else { h.app('background'); h.app('active'); }
  await h.flush(); assert.equal(h.list().props.data.length, 60);
  assert.equal(h.list().props.data[50].id, cards[50].id);
  h.list().props.onEndReached(); await h.flush();
  assert.equal(h.queries.at(-1).cursor, 'older-page');
});
for (const [sort, label] of [['price_asc', '↓ Дешевле'], ['price_desc', '↑ Дороже']]) {
  for (const mode of ['focus', 'AppState']) test(`${sort}: ${mode} обновляет все60, не обрезает хвост и продолжает cursor`, async () => {
    const fixtures = cards.map(item => ({ ...item, amount: Number(item.id), currency: 'USD', price_state: 'known' }));
    const h = harness({ fixtures }); await h.flush();
    h.node('external-feed-filter-price').props.onPress(); await h.flush();
    const choice = descendants(h.node('external-feed-price-options')).find(node =>
      node.type === 'TouchableOpacity' && descendants(node).some(child => child.type === 'Text' && child.props.children.includes(label)));
    choice.props.onPress(); await h.flush();
    h.node('external-feed-apply-filters').props.onPress(); await h.flush();
    assert.equal(h.queries.at(-1).sort, sort);
    h.list().props.onEndReached(); await h.flush();
    assert.equal(h.list().props.data.length, 60);
    // Цена изменила положение записи: нужно освежить весь загруженный префикс,
    // сохранив порядок сервера и следующий cursor, а не склеивать старые цены.
    fixtures.reverse(); fixtures[0] = { ...fixtures[0], amount: 500 };
    if (mode === 'focus') { h.blur(); h.focus(); }
    else { h.app('background'); h.app('active'); }
    await h.flush();
    assert.equal(h.list().props.data.length, 60);
    assert.equal(h.list().props.data[0].id, fixtures[0].id);
    assert.equal(h.list().props.data[0].amount, 500);
    assert.equal(new Set(h.list().props.data.map(item => item.id)).size, 60);
    h.list().props.onEndReached(); await h.flush();
    assert.equal(h.queries.at(-1).cursor, 'older-page');
  });
}
test('offline: предупреждение остаётся при повторном входе и исчезает только после успеха', async () => {
  const h = harness(); await h.flush(); h.fail(true); h.resume(); await h.flush();
  assert.ok(h.warning());
  h.suspend(); h.resume(); await h.flush(); assert.ok(h.warning(), 'warning не должен исчезать до ответа');
  h.release(); await h.flush(); assert.ok(h.warning());
  h.fail(false); h.resume(); await h.flush(); assert.equal(h.warning(), undefined); assert.equal(h.list().props.data.length, 30);
});
test('достижение конца во время фонового запроса не теряет следующую страницу', async () => {
  const h = harness(); await h.flush();
  h.suspend(); h.resume(); await h.flush();
  h.list().props.onEndReached(); await h.flush();
  assert.equal(h.list().props.data.length, 30);
  h.release(); await h.flush();
  assert.equal(h.list().props.data.length, 60);
  assert.equal(h.queries.at(-1).cursor, 'page2');
});

test('сброс кузова сохраняет откуда, а отдельный общий сброс очищает всё', async () => {
  const h = harness(); await h.flush();
  h.node('external-feed-filter-origin').props.onPress(); await h.flush();
  h.node('external-feed-location-search').props.onChangeText('Toshkent'); await h.flush();
  h.node('external-feed-apply-filters').props.onPress(); await h.flush();
  h.filterOffset(1000);
  h.node('external-feed-filter-body').props.onPress(); await h.flush();
  h.pressLabel('Сброс'); await h.flush();
  assert.equal(h.filterOffset(), 0, 'полоса не должна оставаться за пределами уменьшенного содержимого');
  assert.equal(h.queries.at(-1).origin, 'Toshkent');
  h.node('external-feed-filter-body').props.onPress(); await h.flush();
  h.node('external-feed-reset-all').props.onPress(); await h.flush();
  assert.equal(h.queries.at(-1).origin, undefined);
});

test('пустой фильтр закрывается крестиком/снаружи/найти и переключается без сброса', async () => {
  const h = harness(); await h.flush();
  for (const action of ['external-feed-filter-close', 'external-feed-filter-scrim', 'external-feed-apply-filters']) {
    h.node('external-feed-filter-origin').props.onPress(); await h.flush();
    h.node(action).props.onPress(); await h.flush();
    assert.equal(h.node('external-feed-filter-overlay'), undefined);
  }
  h.node('external-feed-filter-origin').props.onPress(); await h.flush();
  h.node('external-feed-location-search').props.onChangeText('Не применять'); await h.flush();
  h.node('external-feed-filter-destination').props.onPress(); await h.flush();
  assert.equal(h.node('external-feed-location-search').props.accessibilityLabel, 'Куда');
  assert.equal(h.node('external-feed-location-search').props.value, '');
  h.node('external-feed-filter-destination').props.onPress(); await h.flush();
  assert.equal(h.node('external-feed-filter-overlay'), undefined);
  h.node('external-feed-filter-origin').props.onPress(); await h.flush();
  assert.equal(h.node('external-feed-location-search').props.value, '');
});

function descendants(tree) {
  const all = [];
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node?.props) return;
    all.push(node); walk(node.props.children);
  }
  walk(tree); return all;
}
for (const role of ['driver', 'client']) test(`${role}: реальный env и helper открывают отправку даже без текста/телефона/цены`, async () => {
  const item = { id: 'minimal', kind: role === 'driver' ? 'cargo' : 'vehicle', status: 'active', contacts: [], body_types: [] };
  const h = harness({ role, fixtures: [item] }); await h.flush();
  const nodes = descendants(h.renderItem(item));
  const description = nodes.find(n => n.type === 'Description');
  assert.equal(description.props.actions.props.testID, 'external-feed-share-minimal');
  assert.ok(nodes.find(n => n.props.testID === 'external-feed-no-contact-minimal'));
  description.props.actions.props.onPress(); await h.flush();
  // Проверяем настоящее состояние экрана после нажатия, а не mock payload.
  const shareModal = h.shareModal();
  assert.equal(shareModal.props.url, 'https://apps.apple.com/kz/app/urtruck/id6764504167');
  assert.match(shareModal.props.shareText, /Android: https:\/\/play\.google\.com/);
  assert.match(shareModal.props.shareText, /iPhone: https:\/\/apps\.apple\.com/);
  assert.ok(!shareModal.props.shareText.includes('https://urtruck.kz/'));
  assert.ok(shareModal.props.visible);
  shareModal.props.onClose(); await h.flush();
  assert.equal(h.shareModal(), undefined);
});

for (const role of ['driver', 'client']) test(`${role}: панель фильтров отделена от ленты, ввод и отмена сохраняют поведение`, async () => {
  const h = harness({ role }); await h.flush();
  h.node('external-feed-filter-origin').props.onPress(); await h.flush();
  const sheet = h.node('external-feed-filter-sheet');
  const overlay = h.node('external-feed-filter-overlay').props.style[0];
  assert.equal(overlay.position, 'absolute', 'RN 0.86 не экспортирует absoluteFillObject: геометрия должна быть задана явно');
  for (const edge of ['top', 'bottom', 'left', 'right']) assert.equal(overlay[edge], 0);
  assert.equal(h.node('external-feed-filter-scrim').props.style.position, 'absolute');
  assert.equal(h.node('external-feed-filter-keyboard-area').props.behavior, 'height', 'Android edge-to-edge не поднимает вложенное окно одним adjustResize');
  assert.equal(h.node('external-feed-filter-keyboard-area').props.keyboardVerticalOffset, h.node('external-feed-filter-overlay').props.style[1].top);
  assert.equal(sheet.props.accessibilityViewIsModal, true);
  assert.equal(sheet.props.style.borderWidth, 1);
  assert.ok(sheet.props.style.shadowOpacity > 0);
  assert.equal(sheet.props.style.elevation, 20);
  const input = h.node('external-feed-location-search');
  assert.equal(input.props.autoFocus, true);
  assert.equal(input.props.style.borderWidth, 2);
  input.props.onChangeText('Алматы'); await h.flush();
  assert.equal(h.node('external-feed-location-search').props.value, 'Алматы');
  h.pressLabel('Отмена'); await h.flush();
  assert.equal(h.node('external-feed-filter-sheet'), undefined);
});

test('iOS компенсирует положение панели под верхними фильтрами', async () => {
  const h = harness({ platform: 'ios' }); await h.flush();
  h.node('external-feed-filter-origin').props.onPress(); await h.flush();
  const keyboard = h.node('external-feed-filter-keyboard-area');
  assert.equal(keyboard.props.behavior, 'padding');
  assert.equal(keyboard.props.keyboardVerticalOffset, h.node('external-feed-filter-overlay').props.style[1].top);
});
for (const role of ['driver', 'client']) test(`${role}: телефоны только копируются, звонилки нет`, async () => {
  const item = { id: 'phone', kind: role === 'driver' ? 'cargo' : 'vehicle', status: 'active',
    contacts: ['+7 (700) 000-00-01', '998500014250', '@source_user'], body_types: [] };
  const h = harness({ role, fixtures: [item] }); await h.flush();
  const nodes = descendants(h.renderItem(item));
  for (let index = 0; index < 2; index++) {
    await nodes.find(n => n.props.testID === `external-feed-copy-phone-${index}`).props.onPress();
  }
  assert.deepEqual(h.copied, item.contacts.slice(0, 2));
  assert.deepEqual(h.opened, [], 'копирование не открывает внешние приложения');
  assert.ok(!nodes.some(n => n.props.testID?.startsWith('external-feed-call-')));
  assert.ok(!nodes.some(n => n.type === 'Feather' && n.props.name === 'phone'));
  await nodes.find(n => n.props.testID === 'external-feed-telegram-contact-phone-2').props.onPress();
  assert.deepEqual(h.opened, ['https://t.me/source_user']);
});
test('контакт перевозчика открывает тот же modal без фиктивного объявления', async () => {
  const item = { id: 'carrier', kind: 'carrier_contact', status: 'active', name: 'Синтетическая компания', phones: ['+77000000001'], sources: [] };
  const h = harness({ role: 'client', fixtures: [item] }); await h.flush();
  const card = h.renderItem(item);
  assert.equal(card.type, 'CarrierContactCard');
  card.props.onShare(); await h.flush();
  assert.match(h.shareModal().props.shareText, /Контакт перевозчика/);
  assert.ok(!h.shareModal().props.shareText.includes(item.phones[0]));
});

for (const role of ['driver', 'client']) test(`${role}: переход в свой пост и Share — независимые действия`, async () => {
  const item = { id: 'own', kind: role === 'driver' ? 'cargo' : 'vehicle', status: 'active', contacts: [],
    origin_source: 'UrTruck_obyavleniya', source_message_id: '44', body_types: [] };
  const h = harness({ role, fixtures: [item] }); await h.flush();
  let nodes = descendants(h.renderItem(item));
  const source = nodes.find(n => n.props.testID === 'external-feed-source-own');
  assert.ok(source);
  await source.props.onPress();
  assert.deepEqual(h.opened, ['https://t.me/UrTruck_obyavleniya/44']);
  const actions = nodes.find(n => n.type === 'Description').props.actions;
  actions.props.onPress(); await h.flush();
  assert.equal(h.shareModal().props.url, 'https://apps.apple.com/kz/app/urtruck/id6764504167');
  nodes = descendants(h.renderItem({ ...item, origin_source: 'foreign_chat' }));
  assert.equal(nodes.find(n => n.props.testID === 'external-feed-source-own'), undefined);
  assert.ok(nodes.find(n => n.type === 'Description').props.actions);
});
