// P0 (2026-09-03): регрессия для бага "session не сохраняется после login —
// экран показывает 'Войдите, чтобы продолжить' после смены вкладок /
// background→foreground / force-stop→reopen".
//
// Root cause: MyTripsScreen.js на каждом navigation focus заново читал
// storage.get('ur_reg_token') напрямую (require(...), в обход AuthContext).
// Любой транзиентный сбой/задержка SecureStore/AsyncStorage сразу после
// resume (storage.js глотает такие ошибки в null) интерпретировался как
// "разлогинен", хотя канонический AuthContext.hasToken оставался true.
//
// В репозитории нет react-test-renderer/@testing-library (см. package.json) —
// весь tests/frontend/*.mjs исторически написан в contract-стиле (assert по
// исходному коду), этот файл следует тому же формату. Точки A-F ниже
// соответствуют пунктам регрессии из P0-задания; где архитектура прило-
// жения не совпадает с классической моделью access/refresh токена (пункт D),
// это явно отмечено — вместо неё проверяется реальный механизм: единый
// bearer-токен + глобальный 401 → auto-signOut (authEvents.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const myTrips = fs.readFileSync('src/screens/MyTripsScreen.js', 'utf8');
const authContext = fs.readFileSync('src/utils/AuthContext.js', 'utf8');
const appNavigator = fs.readFileSync('src/navigation/AppNavigator.js', 'utf8');
const authEvents = fs.readFileSync('src/utils/authEvents.js', 'utf8');
const supabaseConfig = fs.readFileSync('src/config/supabase.js', 'utf8');

// A: login → switch tabs → authenticated state сохраняется.
test('A: MyTripsScreen gates on canonical AuthContext.hasToken, not on a raw per-focus storage read', () => {
  assert.match(myTrips, /import\s*\{\s*useAuth\s*\}\s*from\s*'\.\.\/utils\/AuthContext'/,
    'MyTripsScreen must consume the single source of truth (useAuth), like CargoFeedScreen/ProfileScreen do');
  assert.match(myTrips, /const\s*\{\s*hasToken\s*\}\s*=\s*useAuth\(\)/);
  // Старый анти-паттерн (race на каждом focus) не должен вернуться.
  assert.doesNotMatch(myTrips, /require\(['"]\.\.\/utils\/storage['"]\)\.storage\.get\(['"]ur_reg_token['"]\)/,
    'must not re-read the raw token directly inside load() — that bypasses AuthContext and races on background/foreground');
  // load() обязан зависеть от hasToken, иначе смена сессии не подхватится реактивно.
  assert.match(myTrips, /\},\s*\[isDriver,\s*mounted,\s*hasToken\]\)/);
});

// B: login → cold restart/hydration → session восстанавливается.
test('B: AuthContext hydration on mount restores token + session from storage before flipping loading off', () => {
  assert.match(authContext, /const token = await regAPI\.getToken\(\)/);
  assert.match(authContext, /const raw = await storage\.get\(KEY\)/);
  assert.match(authContext, /restored = JSON\.parse\(raw\); setSession\(restored\)/);
  assert.match(authContext, /setLoading\(false\)/);
});

// C: hydration pending → protected screen НЕ показывает login-required state.
test('C: AppNavigator blocks stack selection on loading before it ever reads hasToken/session', () => {
  const loadingGateIdx = appNavigator.indexOf('if (loading)');
  const stackSelectIdx = appNavigator.indexOf("(!hasToken || !session) ? 'guest'");
  assert.ok(loadingGateIdx !== -1, 'AppNavigator must gate on AuthContext.loading');
  assert.ok(stackSelectIdx !== -1, 'AppNavigator must pick a stack from hasToken/session');
  assert.ok(loadingGateIdx < stackSelectIdx,
    'the loading gate must run BEFORE hasToken/session decide the stack — otherwise a mid-hydration session===null renders as a real logout');
});

// D: реального access+refresh token в этом приложении нет (единый bearer,
// TTL 30 дней/серверный revoke — см. AuthContext.js). Ближайший архитек-
// турный эквивалент "refresh": сервер отдаёт 401 → authedFetch уведомляет
// глобально → AuthContext делает управляемый re-auth (signOut), а не молча
// теряет сессию на первом же сетевом сбое.
test('D (adapted — no refresh token in this app): a 401 from the server drives one canonical re-auth, not a silent per-screen logout', () => {
  assert.match(authEvents, /if \(r && r\.status === 401\) notifyAuthExpired\(\)/);
  assert.match(authContext, /subscribeAuthExpired\(\(\) => \{/);
  assert.match(authContext, /signOut\(\);/);
  // Cooldown защищает от повторных срабатываний одной и той же протухшей сессии.
  assert.match(authEvents, /COOLDOWN_MS/);
});

// E: real logout → storage/session очищается и protected screens закрываются.
test('E: signOut() clears session, hasToken and every persisted auth-adjacent key', () => {
  assert.match(authContext, /setSession\(null\);\s*\n\s*setVerificationLevel\(0\);\s*\n\s*setHasToken\(false\);/);
  assert.match(authContext, /storage\.remove\(KEY\)/);
  assert.match(authContext, /await regAPI\.clearToken\(\)/);
});

// F: повторная инициализация provider/client не уничтожает валидную session.
test('F: exactly one Supabase client instance exists (no competing client can shadow the persisted session)', () => {
  const createClientMatches = supabaseConfig.match(/createClient\(/g) || [];
  assert.equal(createClientMatches.length, 1);
  assert.match(supabaseConfig, /persistSession:\s*true/);
  assert.match(supabaseConfig, /storage:\s*AsyncStorage/);
  // AuthProvider hydration must not unconditionally overwrite state before
  // checking for an existing token — re-mounting the provider must not
  // wipe out a still-valid session.
  assert.match(authContext, /if \(!token\) \{/);
});
