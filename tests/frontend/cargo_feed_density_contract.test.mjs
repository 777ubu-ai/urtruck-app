import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const cargoFeed = fs.readFileSync('src/screens/CargoFeedScreen.js', 'utf8');
const bottomNav = fs.readFileSync('src/components/ui/v1/BottomNav.js', 'utf8');

test('cargo feed keeps the first screen dense enough for narrow mobile browsers', () => {
  // Task 3 §11/§12 сжали маршрутный селектор 68 → 52 и контейнер чипов
  // 50 → 44. Сам filterPill остался 40dp — touch target не ужимался.
  // Значения проверяем ЯКОРНО (\{[^}]*), а не через жадный [\s\S]*:
  // жадная версия находила число в комментарии-бейзлайне ниже по файлу и
  // поэтому не могла поймать реальную регрессию плотности.
  assert.match(cargoFeed, /routeSelector:\s*\{[^}]*minHeight:\s*52/);
  assert.match(cargoFeed, /filtersScroll:\s*\{ flexGrow:\s*0,\s*minHeight:\s*44,\s*maxHeight:\s*44 \}/);
  assert.match(cargoFeed, /filterPill:\s*\{[\s\S]*height:\s*40/);
  assert.match(cargoFeed, /card:\s*\{[^}]*minHeight:\s*100/);
  assert.match(cargoFeed, /routeCity:\s*\{[\s\S]*fontSize:\s*15/);
  assert.match(cargoFeed, /price:\s*\{[\s\S]*fontSize:\s*16\.5/);
});

test('bottom navigation is compact but still keeps the four approved pages', () => {
  assert.match(bottomNav, /const PILL_H = 34/);
  assert.match(bottomNav, /const LABEL_H = 13/);
  assert.match(bottomNav, /const bottomPad = Math\.max\(insets\.bottom, 6\)/);
  assert.match(bottomNav, /fontSize:\s*10\.5/);
  assert.match(bottomNav, /Queue:\s*\{\s*driver:\s*'map-pin',\s*client:\s*'map-pin'\s*\}/);
  assert.doesNotMatch(bottomNav, /Profile:\s*\{/);
});
