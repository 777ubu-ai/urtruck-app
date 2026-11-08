// Design Bible "Direction B" — Commit 5 (Chat / Voice) canon tests
// (owner-approved 2026-09-09). Pattern: design_system_primitives.test.mjs —
// token contract + source-level DWSV2 contract + gray-box render of the real
// VoiceMessageBubble with stubbed hooks (mocks/render-env-hooks.mjs).
//
// Run: node --experimental-loader ./tests/frontend/loader.mjs --test \
//        tests/frontend/design_chat_canon.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register('./mocks/render-env-hooks.mjs', import.meta.url);

const { LIGHT, DARK, withAlpha } = await import('../../src/theme/designV1Palette.js');
const { getBubbleColors, v1BubbleColors } = await import('../../src/theme/designV1.js');
const { default: VoiceMessageBubble } = await import('../../src/components/VoiceMessageBubble.js');
const { StyleSheet } = await import('react-native');

const workspaceSrc = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const bubbleSrc = readFileSync('src/components/VoiceMessageBubble.js', 'utf8');
const i18nSrc = readFileSync('src/utils/i18n.js', 'utf8');

// ── tree helpers (same as design_system_primitives.test.mjs) ─────────
const flatten = (style) => StyleSheet.flatten(style) || {};
const walk = (node, out = []) => {
  if (node == null) return out;
  if (Array.isArray(node)) { node.forEach((n) => walk(n, out)); return out; }
  out.push(node);
  const kids = node.children ?? node.props?.children ?? [];
  walk(Array.isArray(kids) ? kids : [kids], out);
  return out;
};
const findByTestID = (tree, id) => walk(tree).filter((el) => el?.props?.testID === id);
const hitTarget = (el) => {
  const f = flatten(el?.props?.style);
  const h = el?.props?.hitSlop || {};
  return { width: f.width || 0, height: f.height || 0, slop: (h.top || 0) + (h.bottom || 0) + (h.left || 0) + (h.right || 0) };
};

// ══ 1. Bubble token contract ════════════════════════════════════════
test('getBubbleColors: outgoing light/dark are the approved WhatsApp-family values', () => {
  assert.deepEqual(getBubbleColors(true, false), {
    backgroundColor: LIGHT.outgoing, textColor: LIGHT.outgoingText, borderColor: LIGHT.outgoing,
  });
  assert.deepEqual(getBubbleColors(true, true), {
    backgroundColor: DARK.outgoingDark, textColor: DARK.outgoingDarkText, borderColor: DARK.outgoingDark,
  });
  assert.equal(getBubbleColors(true, false).backgroundColor, '#D9FDD3');
  assert.equal(getBubbleColors(true, true).backgroundColor, '#005C4B');
});

test('getBubbleColors: incoming is surface + border in both themes', () => {
  assert.equal(getBubbleColors(false, false).backgroundColor, LIGHT.surface);
  assert.equal(getBubbleColors(false, false).borderColor, LIGHT.border);
  assert.equal(getBubbleColors(false, true).backgroundColor, DARK.surface);
  assert.equal(getBubbleColors(false, true).borderColor, DARK.border);
  assert.deepEqual(v1BubbleColors(true).outgoing.backgroundColor, DARK.outgoingDark);
  assert.deepEqual(v1BubbleColors(false).incoming.backgroundColor, LIGHT.surface);
});

test('withAlpha derives rgba from a hex token (timestamps/tracks derive, never fork)', () => {
  assert.equal(withAlpha('#111B21', 0.26), 'rgba(17,27,33,0.26)');
  assert.equal(withAlpha('#E9EDEF', 0.62), 'rgba(233,237,239,0.62)');
  assert.equal(withAlpha('rgba(1,2,3,0.5)', 0.9), 'rgba(1,2,3,0.5)', 'non-hex passes through untouched');
});

// ══ 2. DealWorkspaceScreenV2 source contract ════════════════════════
test('DWSV2: outgoing bubble fill comes from getBubbleColors, not a hardcoded green', () => {
  assert.doesNotMatch(workspaceSrc, /bubbleMine: \{ backgroundColor: '#168759'/);
  assert.match(workspaceSrc, /getBubbleColors\(true, !!isDark\)/);
  assert.match(workspaceSrc, /bubbleSurfaceFor/);
  // outgoing text/timestamp colours derive from the bubble token
  assert.match(workspaceSrc, /withAlpha\(bubbleMineColors\.textColor, 0\.62\)/);
  assert.doesNotMatch(workspaceSrc, /'rgba\(255,255,255,0\.68\)'/);
  assert.doesNotMatch(workspaceSrc, /'rgba\(255,255,255,0\.65\)'/);
  assert.doesNotMatch(workspaceSrc, /item\.mine \? '#FFFFFF'/);
});

test('DWSV2: translate action uses the info token (readable on incoming surface, both themes)', () => {
  assert.match(workspaceSrc, /<Feather name="globe" size=\{11\} color=\{colors\.info\} \/>/);
  assert.match(workspaceSrc, /translateText, \{ color: colors\.info \}/);
});

test('DWSV2: timestamp canon is the micro token 11/14·600', () => {
  assert.match(workspaceSrc, /messageTime: \{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0\.2/);
});

test('DWSV2: render-level day grouping renders a localized date separator pill', () => {
  assert.match(workspaceSrc, /testID="deal-chat-date-separator"/);
  assert.match(workspaceSrc, /dayKeyOf\(messages\[index - 1\]\) !== dayKeyOf\(item\)/);
  assert.match(workspaceSrc, /formatDayLabel\(item, \{ t, lang \}\)/);
  assert.match(workspaceSrc, /t\('chat_day_today'\)/);
  assert.match(workspaceSrc, /t\('chat_day_yesterday'\)/);
});

test('i18n: chat_day_today / chat_day_yesterday exist in all four locales', () => {
  for (const key of ['chat_day_today', 'chat_day_yesterday']) {
    const count = (i18nSrc.match(new RegExp(`    ${key}:`, 'g')) || []).length;
    assert.equal(count, 4, `${key} must exist in RU/KK/ZH/EN`);
  }
  assert.match(i18nSrc, /chat_day_today: 'Сегодня'/);
  assert.match(i18nSrc, /chat_day_yesterday: 'Вчера'/);
  assert.match(i18nSrc, /chat_day_today: 'Бүгін'/);
  assert.match(i18nSrc, /chat_day_yesterday: 'Кеше'/);
  assert.match(i18nSrc, /chat_day_today: '今天'/);
  assert.match(i18nSrc, /chat_day_yesterday: '昨天'/);
  assert.match(i18nSrc, /chat_day_today: 'Today'/);
  assert.match(i18nSrc, /chat_day_yesterday: 'Yesterday'/);
});

test('DWSV2: while recording the empty composer row is hidden — only the recording bar renders', () => {
  const ternaries = workspaceSrc.match(/!recording \? \(/g) || [];
  assert.equal(ternaries.length, 1, 'a single {!recording ? …} guard must own the whole composer row');
  const guardIdx = workspaceSrc.indexOf('!recording ? (');
  const composerIdx = workspaceSrc.indexOf('testID="deal-chat-composer"');
  const inputIdx = workspaceSrc.indexOf('testID="deal-chat-input"');
  assert.ok(guardIdx !== -1 && composerIdx > guardIdx && inputIdx > guardIdx,
    'composer row (incl. input) must live inside the {!recording ? … : null} guard');
  assert.match(workspaceSrc, /testID="deal-chat-recording-bar"/);
});

test('DWSV2: composer keeps the exact [+] [input+emoji] [mic] [send] order, single mic branch', () => {
  const order = ['deal-chat-plus', 'deal-chat-input', 'deal-chat-emoji', 'deal-chat-voice', 'deal-chat-send'];
  const idx = order.map((id) => workspaceSrc.indexOf(`testID="${id}"`));
  assert.ok(idx.every((i) => i !== -1), 'all composer testIDs present');
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b), 'composer element order is [+] [input] [emoji] [mic] [send]');
  assert.equal((workspaceSrc.match(/testID="deal-chat-voice"/g) || []).length, 1, 'duplicate mic branch removed');
});

test('DWSV2: composer action circles are 40dp with ≥44dp hit target and hairline token border', () => {
  assert.match(workspaceSrc, /composerCircle: \{ width: 40, height: 40, borderRadius: 20[^}]*borderWidth: StyleSheet\.hairlineWidth \}/);
  assert.match(workspaceSrc, /sendButton: \{ width: 40, height: 40, borderRadius: 20/);
  assert.match(workspaceSrc, /hitSlop=\{\{ top: 4, bottom: 4, left: 4, right: 4 \}\}/);
  assert.doesNotMatch(workspaceSrc, /color="#202020"/);
  assert.doesNotMatch(workspaceSrc, /borderColor: '#202020'/);
});

test('DWSV2: dead styles removed (pager dots, disabled circle, recording button, legacy voice row)', () => {
  for (const dead of ['attachPager', 'attachPagerDot', 'attachPagerDotActive', 'composerCircleDisabled', 'recordingButton', 'voiceRow']) {
    assert.ok(!new RegExp(`\\b${dead}\\b`).test(workspaceSrc), `${dead} must be gone`);
  }
  assert.match(workspaceSrc, /PLUS_MENU\.map/, 'attach menu stays data-driven with all 8 localized labels');
  for (const key of ['attachPhoto', 'attachCamera', 'attachShare', 'statuses', 'attachLocation', 'attachDocument', 'attachContact', 'attachTranslate']) {
    assert.match(workspaceSrc, new RegExp(`label: ui\\.${key}\\b`));
  }
});

// ══ 3. VoiceMessageBubble gray-box render (light theme via stubbed hooks) ══
const renderBubble = (props) => VoiceMessageBubble({
  uri: 'file:///voice/a.m4a',
  fallbackDurationSec: 47,
  t: (k) => k,
  ...props,
});

test('voice bubble: play control is 36dp visual inside a ≥44dp hit target', () => {
  const tree = renderBubble({ mine: true, transcript: undefined });
  const play = findByTestID(tree, 'voice-play-btn');
  assert.equal(play.length, 1);
  const t = hitTarget(play[0]);
  assert.equal(t.width, 36);
  assert.equal(t.height, 36);
  assert.ok(t.width + t.slop >= 44 && t.height + t.slop >= 44, `play hit area must be ≥44dp, got visual ${t.width} + slop ${t.slop}`);
});

test('voice bubble: track transparent touch row is 44dp (visual bar stays 4dp)', () => {
  const tree = renderBubble({ mine: true });
  const track = findByTestID(tree, 'voice-progress-track');
  assert.equal(track.length, 1);
  assert.equal(flatten(track[0].props.style).height, 44);
  const bar = flatten(track[0].children[0].props.style);
  assert.equal(bar.height, 4, 'visual progress bar stays thin');
});

test('voice bubble: speed pill ≥22dp with 12sp·700 text; duration 12sp tabular', () => {
  const tree = renderBubble({ mine: true, forceActive: true });
  const pill = findByTestID(tree, 'voice-rate-btn');
  assert.equal(pill.length, 1, 'forceActive renders the speed pill for QA preview');
  assert.ok(flatten(pill[0].props.style).minHeight >= 22);
  const rateText = pill[0].children[0];
  const rf = flatten(rateText.props.style);
  assert.equal(rf.fontSize, 12);
  assert.equal(rf.fontWeight, '700');
  const time = findByTestID(tree, 'voice-time');
  const tf = flatten(time[0].props.style);
  assert.equal(tf.fontSize, 12);
  assert.deepEqual(tf.fontVariant, ['tabular-nums']);
});

test('voice bubble: hairline divider renders above the transcript only when transcript is visible', () => {
  const withTranscript = renderBubble({
    mine: true,
    transcript: { visible: true, transcriptText: 'hello world' },
    onToggleTranscript: () => {},
  });
  const divider = findByTestID(withTranscript, 'voice-transcription-divider');
  assert.equal(divider.length, 1);
  assert.equal(flatten(divider[0].props.style).height, StyleSheet.hairlineWidth);
  const transcriptText = walk(withTranscript).filter((el) => flatten(el.props?.style)?.fontSize === 13 && flatten(el.props?.style)?.lineHeight === 18);
  assert.ok(transcriptText.length >= 1, 'transcript body is 13/18');

  const withoutTranscript = renderBubble({ mine: true, onToggleTranscript: () => {} });
  assert.equal(findByTestID(withoutTranscript, 'voice-transcription-divider').length, 0,
    'no divider when no transcript is rendered');
});

test('voice bubble: outgoing chrome derives from getBubbleColors light token (no #111827 fork)', () => {
  assert.doesNotMatch(bubbleSrc, /#111827/);
  assert.doesNotMatch(bubbleSrc, /rgba\(17,24,39/);
  const tree = renderBubble({ mine: true });
  const play = findByTestID(tree, 'voice-play-btn')[0];
  const playStyle = flatten(play.props.style);
  // track/border surface = bubble text at 26% alpha; icon/fill = bubble text
  assert.equal(playStyle.borderColor, withAlpha(LIGHT.outgoingText, 0.26));
  const icon = play.children[0];
  assert.equal(icon.props.color, LIGHT.outgoingText);
});

test('voice bubble: incoming keeps accent on light, derives muted from tokens', () => {
  const tree = renderBubble({ mine: false });
  const play = findByTestID(tree, 'voice-play-btn')[0];
  const icon = play.children[0];
  assert.equal(icon.props.color, LIGHT.driver, 'incoming accent on light is the driver token');
  const track = findByTestID(tree, 'voice-progress-track')[0];
  assert.equal(flatten(track.children[0].props.style).backgroundColor, withAlpha(LIGHT.driver, 0.18));
});
