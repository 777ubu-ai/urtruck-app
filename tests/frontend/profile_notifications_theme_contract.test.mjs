import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const profile = fs.readFileSync("src/screens/ProfileScreen.js", "utf8");
const deals = fs.readFileSync("src/screens/DealsScreen.js", "utf8");

test("profile exposes a dedicated notifications entry with its own unread badge", () => {
  assert.match(profile, /menu_notifications/);
  assert.match(profile, /screen: 'Notifications'/);
  assert.match(profile, /badgeCount: unreadNotifications/);
  assert.match(profile, /testID: 'profile-notifications'/);
});

test("profile uses explicit theme mode setters, not a light\\/dark toggle inversion", () => {
  assert.match(profile, /const \{ isDark, setThemeMode \} = useTheme\(\)/);
  assert.match(profile, /onPress=\{\(\) => setThemeMode\('light'\)\}/);
  assert.match(profile, /onPress=\{\(\) => setThemeMode\('dark'\)\}/);
});

test("profile localizes every language chip label to the active UI locale", () => {
  assert.match(profile, /const LANGUAGE_LABELS = \{/);
  assert.match(profile, /const localizedLangLabel = useCallback/);
  assert.match(profile, /localizedLangLabel\(l\.code\)/);
});

test("deals screen is theme-aware and must not stay on a hardcoded light palette", () => {
  assert.match(deals, /const colors = useV1Colors\(\)/);
  assert.match(deals, /const s = useMemo\(\(\) => createStyles\(colors\), \[colors\]\)/);
  assert.match(deals, /const createStyles = \(colors\) => StyleSheet\.create/);
  assert.doesNotMatch(deals, /const s = StyleSheet\.create\(/);
});
