import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/ui/v1/BottomNav.js', 'utf8');

test('подпись нижней вкладки растёт с системным шрифтом и допускает перенос', () => {
  assert.match(source, /numberOfLines=\{2\}/);
  const labelStyle = source.match(/label:\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(labelStyle, /minHeight:\s*LABEL_H/);
  assert.doesNotMatch(labelStyle, /\bheight:\s*LABEL_H/);
  assert.match(source, /fontSize:\s*sp\(11\)/);
});
