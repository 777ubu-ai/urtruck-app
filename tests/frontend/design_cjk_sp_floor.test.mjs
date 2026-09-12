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
// Commit 8: the legacy ChatScreen.js and components/chat/VoiceMessageBubble.js
// were deleted as dead code. The live chat chrome is DealWorkspaceScreenV2
// (timestamps/date pills) and components/VoiceMessageBubble.js (voice rows).
const chat = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const voiceBubble = readFileSync('src/components/VoiceMessageBubble.js', 'utf8');
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

test('Chat timestamps and date pills go through sp()', () => {
  // Live chat chrome (DealWorkspaceScreenV2): message time rows (both the
  // incoming and the on-bubble outgoing variants) and the date-separator pill.
  assert.match(chat, /s\.datePillText, \{ color: colors\.textMuted, fontSize: sp\(11\) \}/);
  assert.ok(
    (chat.match(/s\.messageTime, \{[^}]*fontSize: sp\(11\)/g) || []).length >= 2,
    'both messageTime call sites (incoming + on outgoing bubble) use sp(11)',
  );
});

test('VoiceMessageBubble duration/rate/transcript rows go through sp()', () => {
  assert.match(voiceBubble, /s\.time, \{ color: timeColor, fontSize: sp\(12\) \}/);
  assert.match(voiceBubble, /s\.rateText, \{ color: rateColor, fontSize: sp\(12\) \}/);
  assert.match(voiceBubble, /s\.transcriptLabel, \{ color: baseMuted, fontSize: sp\(11\) \}/);
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
