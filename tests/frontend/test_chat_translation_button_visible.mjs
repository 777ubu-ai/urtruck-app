// P0 2026-09-02 — §6 chat translation button visibility.
//
// Физически подтверждено: на Android кнопка «Перевести» пропала визуально.
// Причина: цвет `theme.textMuted` (~#617067) на белом WhatsApp-bubble
// давал недостаточный визуальный контраст — кнопка технически рендерилась,
// но пользователь её не видел. Фикс: brand green #168759 (4.52:1 vs
// белого — WCAG AA) + textDecorationLine: 'underline'.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chatScreen = readFileSync('src/screens/ChatScreen.js', 'utf8');
const workspaceV2 = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');
const i18n = readFileSync('src/utils/i18n.js', 'utf8');

test('i18n ключи t(\'translate\')/t(\'show_original\')/t(\'hide_original\') существуют во всех 4 языках', () => {
  for (const key of ['translate', 'show_original', 'hide_original', 'translation_unavailable']) {
    // Ищем ровно 4 упоминания (RU/EN/KK/ZH)
    const matches = i18n.match(new RegExp(`^\\s+${key}:\\s`, 'gm')) || [];
    assert.ok(matches.length >= 4, `key ${key} должен быть в 4 языках, got ${matches.length}`);
  }
});

test('ChatScreen: кнопка перевода рендерится с accent green и underline', () => {
  assert.match(chatScreen, /color: isMe \? "rgba\(255,255,255,0\.72\)" : "#168759"/,
    'accent green для не-my messages');
  assert.match(chatScreen, /textDecorationLine: "underline"/,
    'underline на translate label');
  assert.match(chatScreen, /t\("translate"\)/, 'i18n key используется');
  assert.match(chatScreen, /t\("show_original"\)/, 'show_original используется');
  assert.match(chatScreen, /t\("hide_original"\)/, 'hide_original используется');
});

test('DealWorkspaceScreenV2: translateText стиль зелёный с underline', () => {
  assert.match(workspaceV2, /translateText:.*'#168759'/s,
    'accent green в translateText style');
  assert.match(workspaceV2, /textDecorationLine: 'underline'/,
    'underline в translateText style');
  assert.match(workspaceV2, /Feather name="globe" size=\{12\} color="#168759"/,
    'globe icon зелёный');
});

test('regression: цвет translate НЕ falls back на #667781 (WhatsApp secondary)', () => {
  assert.doesNotMatch(chatScreen, /translate[^}]*#667781/i,
    '#667781 (secondary/muted) не должен использоваться для translate button');
});
