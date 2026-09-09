// Design v1 Commit 7 — CJK 12sp floor contract.
//
// Chinese glyphs are dense: below 12sp they blur on device. useI18n exposes
// `sp(size)` (and standalone spFor) raising any size to 12 when lang === 'ZH'.
// This test pins the known violation sites to the helper so future edits
// can't reintroduce raw sub-12 sizes at these call sites.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const useI18n = readFileSync('src/utils/useI18n.js', 'utf8');
const bottomNav = readFileSync('src/components/ui/v1/BottomNav.js', 'utf8');
const chat = readFileSync('src/screens/ChatScreen.js', 'utf8');
const voiceBubble = readFileSync('src/components/chat/VoiceMessageBubble.js', 'utf8');
const queue = readFileSync('src/screens/QueueScreenLazyV2.js', 'utf8');
const deals = readFileSync('src/screens/DealsScreen.js', 'utf8');

test('useI18n exposes the CJK floor helper (sp / spFor)', () => {
  assert.match(useI18n, /export const spFor = \(lang, size\)/);
  assert.match(useI18n, /lang === 'ZH' \? Math\.max\(Number\(size\) \|\| 0, 12\) : size/);
  assert.match(useI18n, /sp: \(size\) => spFor\(lang, size\)/);
});

test('BottomNav tab label goes through sp()', () => {
  assert.match(bottomNav, /fontSize: sp\(11\)/);
});

test('Chat timestamps and voice chrome go through sp()', () => {
  assert.match(chat, /msgTime: \{[^}]*fontSize: sp\(11\)/);
  assert.match(chat, /msgStatus: \{ fontSize: sp\(10\.5\)/);
  assert.match(chat, /voiceTime: \{ fontSize: sp\(11\)/);
  assert.match(chat, /fontSize: sp\(11\), color: statusColor/);
});

test('VoiceMessageBubble duration/rate rows go through sp()', () => {
  assert.match(voiceBubble, /s\.duration, \{ color: foreground, fontSize: sp\(11\) \}/);
  assert.match(voiceBubble, /s\.rateText, \{ color: foreground, fontSize: sp\(11\) \}/);
});

test('Queue micro labels (≤10.5) go through sp()', () => {
  assert.match(queue, /s\.cpRoute, \{ color: theme\.textDim, fontSize: sp\(10\.5\) \}/);
  assert.match(queue, /s\.swipeHint, \{ color: theme\.textDim, fontSize: sp\(10\.5\) \}/);
  assert.ok((queue.match(/fontSize: sp\(9\.5\)/g) || []).length >= 3, 'dateState rows use sp(9.5)');
  assert.ok((queue.match(/fontSize: sp\(8\.5\)/g) || []).length >= 2, 'dateAmount rows use sp(8.5)');
});

test('Deals tab count / attention badges go through sp()', () => {
  assert.match(deals, /styles\.tabCount, \{ color: active \? colors\.accent : colors\.textMuted, fontSize: sp\(10\.5\) \}/);
  assert.match(deals, /styles\.tabAttentionText, \{ fontSize: sp\(9\) \}/);
});
