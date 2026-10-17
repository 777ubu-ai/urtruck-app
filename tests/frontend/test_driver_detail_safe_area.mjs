import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/screens/DriverDetail.js', import.meta.url), 'utf8');

test('driver profile reserves bottom system inset so its scroll actions remain reachable', () => {
  const profileRoot = source.match(/<SafeAreaView style=\{\[s\.container, \{ backgroundColor: v1\.bg \}\]\} edges=\{\[(.*?)\]\}>/s);
  assert.ok(profileRoot, 'profile screen root must declare its safe-area edges');
  assert.match(profileRoot[1], /'bottom'/, 'root safe area must include the Android/iOS bottom inset');

  const scroll = source.match(/<ScrollView contentContainerStyle=\{\{([^}]+)\}\}>/s);
  assert.ok(scroll, 'profile actions must remain in the scrollable content');
  assert.match(scroll[1], /paddingBottom:\s*\d+/, 'scroll content keeps reachable end space');
});
