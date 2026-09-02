// P0 2026-09-02 — §5 chat canonical colors freeze.
//
// Утверждённая владельцем (2026-09-02) палитра для чата ВНУТРИ сделки
// (DealWorkspaceScreenV2 → chat lane):
//
//   Chat background:       #EFEAE2  (WhatsApp beige, канон)
//   Outgoing bubble:       #D9FDD3
//   Incoming bubble:       #FFFFFF
//   Primary text:          #111B21
//   Time / secondary:      #667781
//   Composer:              #FFFFFF
//
// Изменение — только через отдельное решение владельца. Тёмный
// насыщенный зелёный для исходящих сообщений запрещён.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');

test('chat background = #EFEAE2 (WhatsApp canon), НЕ #F4EFE7', () => {
  assert.match(workspace, /chatFullscreen:[\s\S]{0,300}?backgroundColor: '#EFEAE2'/,
    'chatFullscreen должен быть #EFEAE2');
  assert.match(workspace, /chatBody:[\s\S]{0,200}?backgroundColor: '#EFEAE2'/,
    'chatBody должен быть #EFEAE2');
  assert.doesNotMatch(workspace, /chatFullscreen:[\s\S]{0,150}?backgroundColor: '#F4EFE7'/,
    'старый #F4EFE7 — регрессия');
});

test('bubbleMine (outgoing) = #D9FDD3', () => {
  assert.match(workspace, /bubbleMine: \{ backgroundColor: '#D9FDD3'/,
    'canonical outgoing bubble');
  // Запрещаем тёмный насыщенный зелёный (например #34936B, #168759, #22C55E)
  assert.doesNotMatch(workspace, /bubbleMine:[\s\S]{0,50}?backgroundColor: '#(34936B|168759|22C55E|0F6B47)'/,
    'тёмный насыщенный зелёный для outgoing — регрессия');
});

test('bubbleThem (incoming) = #FFFFFF', () => {
  assert.match(workspace, /bubbleThem: \{ backgroundColor: '#FFFFFF'/,
    'canonical incoming bubble');
});

test('messageTime secondary color = #667781', () => {
  assert.match(workspace, /messageTime: \{ color: '#667781'/,
    'canonical time/secondary color');
});
