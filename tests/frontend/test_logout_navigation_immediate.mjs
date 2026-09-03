import assert from 'node:assert/strict';
import fs from 'node:fs';

const authContext = fs.readFileSync('src/utils/AuthContext.js', 'utf8');
const pushApi = fs.readFileSync('src/utils/push.js', 'utf8');
const registrationApi = fs.readFileSync('src/utils/registration.js', 'utf8');
const profileScreen = fs.readFileSync('src/screens/ProfileScreen.js', 'utf8');

const signOut = authContext.indexOf('const signOut');
const stateReset = authContext.indexOf('setSession(null);', signOut);
const pushCleanup = authContext.indexOf('push.logoutCleanup(authToken)', signOut);

assert.ok(stateReset > -1, 'signOut должен сбрасывать локальную сессию');
assert.ok(pushCleanup > -1, 'signOut должен очищать push по сохранённому токену');
assert.ok(stateReset < pushCleanup, 'auth-state должен сбрасываться до сетевой очистки');
const tokenClear = authContext.indexOf('await regAPI.clearToken();', signOut);
assert.ok(tokenClear > stateReset && tokenClear < pushCleanup, 'локальный токен должен удаляться до сетевой очистки');
assert.match(authContext, /withTimeout\(push\.logoutCleanup\(authToken\)\)/);
assert.match(authContext, /withTimeout\(regAPI\.logout\(authToken\)\)/);
assert.match(pushApi, /async logoutCleanup\(token = null\)/);
assert.match(registrationApi, /async logout\(token = null\)/);
assert.match(authContext, /role: hasRealRole \? me\.role : \(base\.role \|\| null\)/);
const signInStart = authContext.indexOf('const signIn = async');
const signInRefresh = authContext.indexOf('refreshLevel().catch(() => {});', signInStart);
const setRoleStart = authContext.indexOf('const setRole = (role)');
assert.ok(signInRefresh > signInStart && signInRefresh < setRoleStart, 'signIn запускает background refreshLevel до explicit setRole');
assert.ok(
  authContext.indexOf('role: hasRealRole ? me.role : (base.role || null)') > -1,
  'late refreshLevel without a real backend role must preserve explicit role from current session',
);
assert.doesNotMatch(profileScreen, /setConfirmDialog\(\(current\).*resolve/s);
assert.match(profileScreen, /const resolve = confirmDialog\?\.resolve/);
assert.match(profileScreen, /setConfirmDialog\(null\);\s*resolve\?\.\(answer\)/);

console.log('logout navigation immediate: ok');
