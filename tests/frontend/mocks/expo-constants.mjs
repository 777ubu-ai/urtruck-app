// Minimal mock for expo-constants (Block: auth retry regression,
// 25.08.2026). expo-constants' own build/Constants.js does an extensionless
// internal import ('./Constants.types') that Metro/Expo resolve fine but
// strict Node ESM rejects (ERR_MODULE_NOT_FOUND) — unrelated to this
// project's code. src/config/env.js only reads
// Constants?.expoConfig?.extra?.eas?.profile /
// Constants?.manifest?.extra?.eas?.profile, both intentionally absent here
// so env.js falls through to its production default, exactly like a plain
// `node --test` process (no Expo runtime) would in practice.
export default { expoConfig: null, manifest: null };
