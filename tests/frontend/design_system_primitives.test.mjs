// Design-system primitives — token contract + behavioral gray-box tests for
// Commit 1 of the Design Bible "Direction B: Modern Global/China Hybrid"
// (owner-approved 2026-09-09). Pattern: favorites_render_runtime.test.mjs —
// module.register of mocks/render-env-hooks.mjs, components called as plain
// functions, returned element trees inspected directly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./mocks/render-env-hooks.mjs', import.meta.url);

const { LIGHT, DARK } = await import('../../src/theme/designV1Palette.js');
const designV1 = await import('../../src/theme/designV1.js');
const { default: Button } = await import('../../src/components/ui/v1/Button.js');
const { default: StatusPill } = await import('../../src/components/ui/v1/StatusPill.js');
const { default: Flag, flagColors, isKnownFlagCode } = await import('../../src/components/ui/v1/Flag.js');
const { default: Card } = await import('../../src/components/ui/v1/Card.js');
const { StyleSheet } = await import('react-native');

// ── tree helpers ─────────────────────────────────────────────────────
const flatten = (style) => StyleSheet.flatten(style) || {};
const walk = (node, out = []) => {
  if (node == null) return out;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, out)); return out; }
  out.push(node);
  const kids = node.children ?? node.props?.children ?? [];
  walk(Array.isArray(kids) ? kids : [kids], out);
  return out;
};
const typeName = (el) => (el?.type?.displayName) || (typeof el?.type === 'string' ? el.type : el?.type?.name);
const findByType = (tree, name) => walk(tree).filter((el) => typeName(el) === name);

// ══ 1. Token contract ════════════════════════════════════════════════
test('palette LIGHT: exact approved values for all new token entries', () => {
  assert.equal(LIGHT.outgoing, '#D9FDD3');
  assert.equal(LIGHT.outgoingText, '#111B21');
  assert.equal(LIGHT.clientAccent, '#FF8400');
  assert.equal(LIGHT.statusAccepted, '#168759');
  assert.equal(LIGHT.statusInProgress, '#2878D6');
  assert.equal(LIGHT.statusAtBorder, '#B45800');
  assert.equal(LIGHT.statusDelivered, '#0E9384');
  assert.equal(LIGHT.statusReceived, '#0F6B47');
  assert.equal(LIGHT.statusCompleted, '#7C8B82');
  assert.equal(LIGHT.statusCancelled, '#718078');
  // Pre-existing entries must not have moved (back-compat for 76 consumers).
  assert.equal(LIGHT.driver, '#168759');
  assert.equal(LIGHT.border, '#E5ECE8');
  assert.equal(LIGHT.text, '#14221C');
});

test('palette DARK: exact approved dark values for all new token entries', () => {
  assert.equal(DARK.outgoingDark, '#005C4B');
  assert.equal(DARK.outgoingDarkText, '#E9EDEF');
  assert.equal(DARK.errorDark, '#E06565');
  assert.equal(DARK.statusAccepted, '#3BB273');
  assert.equal(DARK.statusInProgress, '#5BA3F5');
  assert.equal(DARK.statusAtBorder, '#F5B75B');
  assert.equal(DARK.statusDelivered, '#2DD4BF');
  assert.equal(DARK.statusReceived, '#3BB273');
  assert.equal(DARK.statusCompleted, '#9EAAA2');
  assert.equal(DARK.statusCancelled, '#7C8B82');
  assert.equal(DARK.border, '#2A3930');
});

test('designV1 accessors expose the new tokens (v1Colors, helpers)', () => {
  // v1Colors is the frozen LIGHT export — new LIGHT keys must be reachable.
  assert.equal(designV1.v1Colors.outgoing, '#D9FDD3');
  assert.equal(designV1.v1Colors.clientAccent, '#FF8400');
  assert.equal(typeof designV1.useV1Colors, 'function');
  assert.equal(typeof designV1.v1StatusColors, 'function');
  assert.equal(typeof designV1.getStatusColor, 'function');
  assert.equal(typeof designV1.getBubbleColors, 'function');
  assert.equal(typeof designV1.v1BubbleColors, 'function');
  // status-role helper maps every approved status to its LIGHT role color.
  const roles = designV1.v1StatusColors(LIGHT);
  assert.equal(roles.accepted, '#168759');
  assert.equal(roles.in_progress, '#2878D6');
  assert.equal(roles.at_border, '#B45800');
  assert.equal(roles.delivered, '#0E9384');
  assert.equal(roles.received, '#0F6B47');
  assert.equal(roles.completed, '#7C8B82');
  assert.equal(roles.cancelled, '#718078');
  assert.equal(designV1.v1StatusColors(DARK).delivered, '#2DD4BF');
  // unknown status falls back to textDim, never undefined.
  assert.equal(designV1.getStatusColor(LIGHT, 'nonsense'), LIGHT.textDim);
});

test('v1Typography keeps all existing entries and adds label/micro/price', () => {
  const t = designV1.v1Typography;
  // Existing entries unchanged:
  assert.equal(t.button.fontSize, 15);
  assert.equal(t.body.fontSize, 15);
  assert.equal(t.caption.fontSize, 12);
  assert.equal(t.small.fontSize, 11);
  // New additive entries:
  assert.deepEqual(
    { fontSize: t.label.fontSize, lineHeight: t.label.lineHeight, fontWeight: t.label.fontWeight },
    { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  );
  assert.deepEqual(
    { fontSize: t.micro.fontSize, lineHeight: t.micro.lineHeight, fontWeight: t.micro.fontWeight },
    { fontSize: 11, lineHeight: 14, fontWeight: '600' },
  );
  assert.deepEqual(
    { fontSize: t.price.fontSize, lineHeight: t.price.lineHeight, fontWeight: t.price.fontWeight },
    { fontSize: 17, lineHeight: 22, fontWeight: '800' },
  );
  assert.equal(typeof designV1.useV1Typography, 'function');
});

test('v1Radius.button is the approved 14 (canonical button radius)', () => {
  assert.equal(designV1.v1Radius.button, 14);
  assert.equal(designV1.v1Radius.card, 16);
  assert.equal(designV1.v1Radius.pill, 999);
});

// ══ 2. Button ════════════════════════════════════════════════════════
test('Button renders its label and uses the primary accent fill', () => {
  const tree = Button({ title: 'Предложить ставку', onPress() {} });
  assert.equal(typeName(tree), 'TouchableOpacity');
  const texts = findByType(tree, 'Text');
  assert.ok(texts.some((el) => el.children.includes('Предложить ставку')), 'label text must render');
  const st = flatten(tree.props.style);
  assert.equal(st.backgroundColor, LIGHT.driver, 'primary variant = filled driver accent');
  assert.equal(st.borderRadius, 14);
  assert.ok(st.minHeight >= 48 && st.minHeight <= 52, 'height contract 48–52');
  assert.equal(tree.props.accessibilityRole, 'button');
});

test('Button disabled → 38% opacity and inert onPress', () => {
  let pressed = 0;
  const tree = Button({ title: 'X', onPress() { pressed += 1; }, disabled: true });
  const st = flatten(tree.props.style);
  assert.equal(st.opacity, 0.38);
  assert.equal(tree.props.onPress, undefined, 'inert buttons must not forward onPress');
  assert.equal(tree.props.disabled, true);
  assert.equal(tree.props.accessibilityState.disabled, true);
});

test('Button loading → ActivityIndicator replaces the label, width contract kept', () => {
  const tree = Button({ title: 'X', onPress() {}, loading: true });
  const spinners = findByType(tree, 'ActivityIndicator');
  assert.equal(spinners.length, 1, 'exactly one ActivityIndicator in loading state');
  assert.equal(spinners[0].props.color, LIGHT.driverOnAccent);
  const texts = findByType(tree, 'Text');
  assert.equal(texts.length, 0, 'label must be absent while loading');
  const st = flatten(tree.props.style);
  assert.ok(st.minWidth >= 120 && st.minHeight >= 48, 'stable loading box');
  assert.equal(tree.props.accessibilityState.busy, true);
});

test('Button secondary/tertiary/destructive use their contract colors', () => {
  const sec = flatten(Button({ title: 'S', onPress() {}, variant: 'secondary' }).props.style);
  assert.equal(sec.backgroundColor, LIGHT.driverSoft, 'secondary = accentSoft bg');
  const tert = flatten(Button({ title: 'T', onPress() {}, variant: 'tertiary' }).props.style);
  assert.equal(tert.backgroundColor, 'transparent');
  assert.equal(tert.borderWidth ?? 1, 1, 'tertiary = 1px border');
  const dest = flatten(Button({ title: 'D', onPress() {}, variant: 'destructive' }).props.style);
  assert.equal(dest.backgroundColor, LIGHT.error, 'destructive = error fill (light theme)');
});

test('Button icon renders a Feather glyph 8px before the label', () => {
  const tree = Button({ title: 'Go', onPress() {}, icon: 'arrow-right' });
  const icons = walk(tree).filter((el) => typeName(el) === 'StubIcon' || (el.props && 'name' in el.props && el.props.name === 'arrow-right'));
  assert.equal(icons.length, 1);
  assert.equal(icons[0].props.name, 'arrow-right');
  const st = flatten(icons[0].props.style);
  assert.equal(st.marginRight, 8);
});

test('Button accessibilityLabel defaults to the title and is overridable', () => {
  assert.equal(Button({ title: 'Send', onPress() {} }).props.accessibilityLabel, 'Send');
  assert.equal(Button({ title: 'Send', onPress() {}, accessibilityLabel: 'custom' }).props.accessibilityLabel, 'custom');
});

// ══ 3. StatusPill ════════════════════════════════════════════════════
const STATUS_EXPECTED = {
  accepted: '#168759',
  in_progress: '#2878D6',
  at_border: '#B45800',
  delivered: '#0E9384',
  received: '#0F6B47',
  completed: '#7C8B82',
  cancelled: '#718078',
};

test('StatusPill maps each status to its role color (dot + label + tint)', () => {
  for (const [status, hex] of Object.entries(STATUS_EXPECTED)) {
    const tree = StatusPill({ status, label: `L-${status}` });
    const views = findByType(tree, 'View');
    const dot = views.find((el) => flatten(el.props.style).width === 7 && flatten(el.props.style).borderRadius === 3.5);
    assert.ok(dot, `dot must exist for ${status}`);
    assert.equal(flatten(dot.props.style).backgroundColor, hex, `${status} dot color`);
    const text = findByType(tree, 'Text')[0];
    assert.equal(flatten(text.props.style).color, hex, `${status} label color`);
    assert.equal(text.children[0], `L-${status}`);
    const pillSt = flatten(tree.props.style);
    assert.equal(pillSt.backgroundColor, `${hex}12`, `${status} translucent tint`);
    assert.equal(pillSt.borderRadius, 999);
    const labelSt = flatten(text.props.style);
    assert.equal(labelSt.fontSize, 12);
    assert.equal(labelSt.fontWeight, '700');
  }
});

test('StatusPill color override wins over the role color', () => {
  const tree = StatusPill({ status: 'accepted', label: 'X', color: '#123456' });
  const text = findByType(tree, 'Text')[0];
  assert.equal(flatten(text.props.style).color, '#123456');
});

// ══ 4. Flag ══════════════════════════════════════════════════════════
test('flagColors: KZ/RU/CN distinct sets, unknown code falls back to null', () => {
  const kz = flagColors('KZ');
  const ru = flagColors('RU');
  const cn = flagColors('CN');
  assert.ok(kz && ru && cn, 'known codes resolve');
  assert.notDeepEqual(kz.colors, ru.colors, 'KZ ≠ RU');
  assert.notDeepEqual(kz.colors, cn.colors, 'KZ ≠ CN');
  assert.notDeepEqual(ru.colors, cn.colors, 'RU ≠ CN');
  assert.equal(flagColors('XX'), null, 'unknown code → null (grey fallback in render)');
  assert.equal(isKnownFlagCode('kz'), true, 'codes are case-insensitive');
  assert.equal(isKnownFlagCode('XX'), false);
});

test('Flag renders stripe geometry; unknown code renders grey fallback with ?', () => {
  const ru = Flag({ code: 'RU' });
  const views = findByType(ru, 'View');
  const stripeColors = views
    .map((el) => flatten(el.props.style).backgroundColor)
    .filter(Boolean);
  for (const c of ['#FFFFFF', '#0039A6', '#D52B1E']) {
    assert.ok(stripeColors.includes(c), `RU must include stripe ${c}`);
  }
  const unknown = Flag({ code: 'XX' });
  const unknownBg = flatten(unknown.props.style).backgroundColor;
  assert.equal(unknownBg, '#C8D8CF', 'unknown flag = grey #C8D8CF');
  const mark = findByType(unknown, 'Text')[0];
  assert.equal(mark.children[0], '?');
});

// ══ 5. Chat bubble colors ════════════════════════════════════════════
test('getBubbleColors: light outgoing #D9FDD3/#111B21, dark #005C4B/#E9EDEF', () => {
  const light = designV1.getBubbleColors(true, false);
  assert.equal(light.backgroundColor, '#D9FDD3');
  assert.equal(light.textColor, '#111B21');
  const dark = designV1.getBubbleColors(true, true);
  assert.equal(dark.backgroundColor, '#005C4B');
  assert.equal(dark.textColor, '#E9EDEF');
  // incoming = surface/border + text, both themes.
  const inc = designV1.getBubbleColors(false, false);
  assert.equal(inc.backgroundColor, LIGHT.surface);
  assert.equal(inc.borderColor, LIGHT.border);
  assert.equal(inc.textColor, LIGHT.text);
  const incDark = designV1.getBubbleColors(false, true);
  assert.equal(incDark.backgroundColor, DARK.surface);
  assert.equal(incDark.borderColor, DARK.border);
  // Full-contract helper agrees.
  assert.equal(designV1.v1BubbleColors(false).outgoing.backgroundColor, '#D9FDD3');
  assert.equal(designV1.v1BubbleColors(true).outgoing.backgroundColor, '#005C4B');
});

// ══ 6. Card ══════════════════════════════════════════════════════════
test('Card: radius 16, surface bg, 1px border, padding 16, no shadow', () => {
  const tree = Card({ children: null });
  const st = flatten(tree.props.style);
  assert.equal(st.borderRadius, 16);
  assert.equal(st.backgroundColor, LIGHT.surface);
  assert.equal(st.borderColor, LIGHT.border, 'border-only separation (light #E5ECE8)');
  assert.equal(st.borderWidth, 1);
  assert.equal(st.padding, 16);
  assert.equal(st.shadowOpacity ?? 0, 0, 'NO shadow on cards');
  assert.equal(st.elevation ?? 0, 0);
});

test('Card: onPress turns it into a touchable with a pressed state', () => {
  let pressedBox = null;
  const tree = Card({ children: null, onPress() {}, testID: 'card-x' });
  assert.equal(typeName(tree), 'Pressable');
  assert.equal(tree.props.accessibilityRole, 'button');
  assert.equal(tree.props.testID, 'card-x');
  const styleFn = tree.props.style;
  assert.equal(typeof styleFn, 'function', 'pressed-state style must be a function');
  const idle = flatten(styleFn({ pressed: false }));
  assert.equal(idle.backgroundColor, LIGHT.surface);
  pressedBox = flatten(styleFn({ pressed: true }));
  assert.equal(pressedBox.transform[0].scale, 0.97, 'pressed = 0.97 scale');
  assert.equal(pressedBox.backgroundColor, LIGHT.driverSoft, 'pressed = accentSoft tint');
});

test('Card: style override and accessibilityLabel pass through', () => {
  const tree = Card({ children: null, style: { marginTop: 4 }, accessibilityLabel: 'cargo card' });
  assert.equal(flatten(tree.props.style).marginTop, 4);
  assert.equal(tree.props.accessibilityLabel, 'cargo card');
});
