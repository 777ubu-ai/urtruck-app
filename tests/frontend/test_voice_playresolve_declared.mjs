// P0 2026-09-02 — §8 voiceRecorder ReferenceError guard.
//
// Root cause физического бага: в src/utils/voiceRecorder.js внутри play()
// был блок `if (_playResolve) { ... }` — но переменная _playResolve не была
// объявлена ни на module scope, ни как глобальная. В native (не strict в
// глобале, но module code = strict) это бросало ReferenceError → catch
// вокруг run глотал ошибку, но _sound.unloadAsync() не выполнялся, а
// значит второй play() иногда играл поверх старого или молчал.
//
// Runtime-репро (см. репост в repo):
//   node -e 'try { if (_playResolve) {} } catch(e){console.log(e.message)}'
//   → "_playResolve is not defined"
//
// Инвариант: переменная объявлена ДО первого использования и на module scope.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/utils/voiceRecorder.js', 'utf8');

test('_playResolve объявлена как let _playResolve на module scope', () => {
  assert.match(src, /^let _playResolve = null;?\s*$/m,
    'module-scope let _playResolve обязательно объявлена (иначе ReferenceError в play())');
});

test('_playResolve объявлена ДО первого использования', () => {
  const declIdx = src.search(/^let _playResolve = null/m);
  const useIdx = src.search(/^\s*if \(_playResolve\)/m);
  assert.ok(declIdx !== -1, 'let _playResolve должна быть');
  assert.ok(useIdx !== -1, '_playResolve используется в play()');
  assert.ok(declIdx < useIdx, 'объявление должно быть выше использования');
});

test('play() оборачивает unloadAsync в try/catch, чтобы stale sound не ронял поток', () => {
  // Точечный фикс: try { await _sound.unloadAsync(); } catch { }
  // до фикса — просто `await _sound.unloadAsync();` без catch, что при stale
  // sound (уже unloaded в другом месте) выбрасывало и оставляло _sound не null.
  assert.match(src,
    /try\s*\{\s*await _sound\.unloadAsync\(\)\s*;\s*\}\s*catch\s*\{[^}]*\}/,
    'unloadAsync должен быть в try/catch');
});

// §9 — false red toast «Не удалось воспроизвести»
// Root cause: play() run IIFE не возвращала `true` при успехе на native →
// вызывающий получал undefined → ChatScreen (`!ok`) → toast.
test('§9: native play() возвращает true при успешном старте (иначе ложный тост)', () => {
  // Regex: return true; идёт СРАЗУ ПОСЛЕ закрывающей } блока
  // sound.setOnPlaybackStatusUpdate(...); внутри try {} перед catch (e)
  assert.match(
    src,
    /setOnPlaybackStatusUpdate\([\s\S]{20,2000}?}\);\s*(?:\/\/[^\n]*\n\s*){0,10}return true;\s*\}\s*catch\s*\(e\)/,
    'return true; должен быть после setOnPlaybackStatusUpdate внутри try, перед catch (e)'
  );
});
