// P0 2026-09-02 — §10 chat keyboard/composer contract.
//
// Физический баг: composer оставался под клавиатурой на Android.
// Root cause: DealWorkspaceScreenV2 объявлял KeyboardAvoidingView с
// behavior={Platform.OS === 'ios' ? 'padding' : undefined}. `undefined`
// на Android — это no-op → RN не поднимает контейнер, композер под
// клавиатурой.
//
// Канон (WhatsApp-like поведение, iOS + Android):
//   - iOS: behavior='padding'
//   - Android: behavior='height' (не undefined!)
//   - Весь экран внутри KAV (header + messages + input)
//   - flex:1 на корневом контейнере
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chat = readFileSync('src/screens/ChatScreen.js', 'utf8');
const workspace = readFileSync('src/screens/DealWorkspaceScreenV2.js', 'utf8');

test('ChatScreen KAV: iOS padding, Android height', () => {
  assert.match(chat, /behavior=\{Platform\.OS === "ios" \? "padding" : "height"\}/,
    'canonical KAV behavior mapping');
});

test('DealWorkspaceScreenV2 KAV: iOS padding, Android height (НЕ undefined)', () => {
  assert.match(workspace, /behavior=\{Platform\.OS === 'ios' \? 'padding' : 'height'\}/,
    'Android получает "height", а не undefined');
  assert.doesNotMatch(workspace, /behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/,
    'undefined на Android = no-op = composer под клавиатурой');
});

test('KAV обёртка охватывает весь экран, а не только input', () => {
  // ChatScreen: KAV с style={{ flex: 1 }} наверху
  assert.match(chat, /<KeyboardAvoidingView[\s\n]*style=\{\{ flex: 1 \}\}/,
    'ChatScreen KAV с flex:1');
  // DealWorkspaceV2: KAV с style={s.safe} (safe уже flex:1)
  assert.match(workspace, /<KeyboardAvoidingView[\s\S]{1,600}?style=\{s\.safe\}/,
    'DealWorkspaceV2 KAV на весь safe контейнер');
});
