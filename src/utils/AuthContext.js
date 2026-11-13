import { sessionRole } from './publicationSession';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { storage } from './storage';
import { runAuthMutation } from './authMutation';
import { API_BASE } from '../config/env';
import { saveSessionRecovery, readSessionRecovery, completeSessionRecovery, clearSessionRecovery, restoreSharedWork, clearSharedAndOwnedDrafts, migrateVerifiedLegacyDrafts } from './sessionRecovery';
import { regAPI } from './registration';
import { clearSocialAuthSession } from './socialAuth';
import { subscribeAuthExpired, setAuthExpirySuppressed, configureAuthExpiryValidation } from './authEvents';
import { push } from './push';
import { clearAppIconBadge } from './appBadge';
import { clearPushEventDedup } from './pushEventDedup';
import { clearOutboxForUser, pauseOutbox, flushOutbox } from './outbox';
import { chatAPI } from './chatAPI';
import { clearQueue } from './offlineQueue';
import {
  stopBackgroundTrackingForLogout,
  restoreBackgroundTrackingForLogoutFailure,
  clearBackgroundLocationSampleForLogout,
} from './backgroundLocation';

// Уровни доверия (lazy registration)
// 0 = guest — только смотрит ленту
// 1 = auth identity — подтверждён Phone/Email/Google/Apple
// 2 = identity — ИИН + селфи, может связываться
// 3 = driver — права + авто, может брать рейсы
export const LEVELS = { GUEST: 0, PHONE: 1, IDENTITY: 2, DRIVER: 3 };

const AuthContext = createContext({
  session: null,
  verificationLevel: 0,
  signIn: () => {},
  signOut: () => {},
  setRole: () => {},
  ensureGuest: async () => {},
  refreshLevel: async () => {},
  loading: true,
});

const KEY = 'ur_session';
const LOGOUT_NETWORK_TIMEOUT_MS = 3000;
async function authOwnerIsCurrent(expectedToken, expectedGeneration, readGeneration, readToken) {
  if (readGeneration() !== expectedGeneration) return false;
  const liveToken = await readToken();
  return readGeneration() === expectedGeneration && liveToken === expectedToken;
}

function commitGuestToken(data, expectedGeneration, readGeneration, readToken, writeToken, onCommit) {
  return runAuthMutation(async () => {
    if (!data?.token || readGeneration() !== expectedGeneration) {
      return { ok: false, reason: 'session_changed' };
    }
    const existing = await readToken();
    if (readGeneration() !== expectedGeneration) return { ok: false, reason: 'session_changed' };
    if (existing) {
      onCommit(data);
      return { token: existing, existing: true };
    }
    await writeToken(data.token);
    if (readGeneration() !== expectedGeneration) return { ok: false, reason: 'session_changed' };
    onCommit(data);
    return data;
  });
}

const withTimeout = (promise, timeoutMs = LOGOUT_NETWORK_TIMEOUT_MS, onTimeout = null) => Promise.race([
  promise,
  new Promise(resolve => setTimeout(() => {
    try { onTimeout?.(); } catch {}
    resolve({ ok: false, reason: 'timeout' });
  }, timeoutMs)),
]);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [verificationLevel, setVerificationLevel] = useState(0);
  const [hasToken, setHasToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const authGenerationRef = useRef(0);
  const sessionRef = useRef(session);
  const pendingRecoveryRef = useRef(null);
  const legacyBootstrapRef = useRef(null);

  const recoverRejectedSession = useCallback((rejectedToken, generation) => runAuthMutation(async () => {
    if (!await authOwnerIsCurrent(rejectedToken, generation,
      () => authGenerationRef.current, () => regAPI.getToken())) return;
    const previous = sessionRef.current;
    legacyBootstrapRef.current = null;
    const recovery = pendingRecoveryRef.current || { apiBase: previous?.apiBase || 'legacy:unknown', ownerId: previous?.user?.id || null };
    pendingRecoveryRef.current = recovery;
    pauseOutbox(true);
    // Немедленно закрываем приватные экраны. Обычный signOut удаляет работу,
    // поэтому при отклонении сессии его намеренно не вызываем.
    authGenerationRef.current += 1;
    sessionRef.current = null;
    setSession(null);
    setHasToken(false);
    setVerificationLevel(0);
    setRecoveryRequired(true);
    await saveSessionRecovery(recovery);
    pendingRecoveryRef.current = await completeSessionRecovery(recovery);
    await regAPI.clearToken();
    await storage.remove(KEY);
    await storage.remove('ur_verification_level');
    clearAppIconBadge();
    try { await clearPushEventDedup(); } catch {}
    // Черновики с ownerId и неотправленные сообщения остаются у владельца.
    // Никаких revoke/guest/переноса bearer между окружениями.
  }), []);

  // A failed canonical logout must not silently leave the bearer and push
  // ownership active until server TTL. One bounded retry is made on each app
  // start; failures stay durably queued without blocking navigation.
  useEffect(() => {
    withTimeout(regAPI.flushPendingLogout()).catch(() => {});
  }, []);

  const refreshLevel = useCallback(async ({ expectedToken = null, expectedGeneration = null } = {}) => {
    const generation = expectedGeneration ?? authGenerationRef.current;
    const tokenAtStart = expectedToken ?? await regAPI.getToken();
    if (!tokenAtStart || generation !== authGenerationRef.current) return null;
    let me;
    try { me = await regAPI.me({ token: tokenAtStart }); }
    catch (error) {
      if (error?.status !== 401 || error?.code !== 'AUTH_REQUIRED') throw error;
      await recoverRejectedSession(tokenAtStart, generation);
      return null;
    }
    if (!await authOwnerIsCurrent(
      tokenAtStart, generation, () => authGenerationRef.current, () => regAPI.getToken(),
    )) return null;
    if (me && typeof me.verification_level === 'number') {
      const hasRealRole = me.role && me.role !== 'guest';
      let profile = null;
      if (me.id || hasRealRole) {
        profile = hasRealRole ? await regAPI.profile() : null;
        if (!await authOwnerIsCurrent(
          tokenAtStart, generation, () => authGenerationRef.current, () => regAPI.getToken(),
        )) return null;
      }
      await runAuthMutation(async () => {
        if (!await authOwnerIsCurrent(
          tokenAtStart, generation, () => authGenerationRef.current, () => regAPI.getToken(),
        )) return;
        const legacy = legacyBootstrapRef.current;
        if (legacy?.token === tokenAtStart && legacy.ownerId === me.id && (!legacy.apiBase || legacy.apiBase === API_BASE)) {
          await migrateVerifiedLegacyDrafts({ apiBase: API_BASE, ownerId: me.id });
          legacyBootstrapRef.current = null;
        }
        if (me.id) await restoreSharedWork({ apiBase: API_BASE, ownerId: me.id });
        setVerificationLevel(me.verification_level);
        if (me.id || hasRealRole) {
          const prev = sessionRef.current;
          const base = prev?.user?.id === me.id ? prev.user : {};
          const fullName = profile?.name || me.full_name || null;
          const city = profile?.city || null;
          const next = {
            ...(prev || {}),
            apiBase: API_BASE,
            user: {
              ...base,
              role: sessionRole({ user: me }),
              phone: me.phone || base.phone,
              id: me.id || base.id,
              name: fullName || base.name || null,
              full_name: fullName || base.full_name || null,
              city: city || base.city || null,
            },
          };
          sessionRef.current = next;
          setSession(next);
          await storage.set(KEY, JSON.stringify(next));
          pauseOutbox(false);
          flushOutbox((payload, guard) => chatAPI.send(payload, guard), me.id).catch(() => {});
        }
      });
    }
    return me;
  }, [recoverRejectedSession]);

  useEffect(() => {
    (async () => {
      let recovery;
      try { recovery = await readSessionRecovery(); }
      catch { setRecoveryRequired(true); pauseOutbox(true); setLoading(false); return; }
      if (recovery) {
        pendingRecoveryRef.current = recovery;
        setRecoveryRequired(true);
        pauseOutbox(true);
        try {
          await runAuthMutation(async () => {
            pendingRecoveryRef.current = await completeSessionRecovery(recovery);
            await regAPI.clearToken();
            await storage.remove(KEY);
            await storage.remove('ur_verification_level');
          });
        } catch {
          // Пока durable-карантин не завершён, приватные экраны закрыты.
          // signIn повторит эту операцию до допуска следующего пользователя.
        }
        setLoading(false);
        return;
      }
      const token = await regAPI.getToken();
      if (!token) {
        await storage.remove(KEY);
        sessionRef.current = null;
        setSession(null);
        setHasToken(false);
        setVerificationLevel(0);
        setLoading(false);
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          // eslint-disable-next-line no-console
          console.warn('[Auth] no token — clean state');
        }
        return;
      }
      setHasToken(true);
      const raw = await storage.get(KEY);
      let restored = null;
      if (raw) {
        try { restored = JSON.parse(raw); sessionRef.current = restored; setSession(restored); } catch {}
      }
      legacyBootstrapRef.current = { token, ownerId: restored?.user?.id, apiBase: restored?.apiBase };
      const savedLevel = await regAPI.getLevel();
      setVerificationLevel(savedLevel);
      setLoading(false);
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[Auth] session restored', {
          hasToken: true,
          hasSession: !!restored,
          role: restored?.user?.role || null,
          level: savedLevel,
        });
      }
      refreshLevel().catch(() => {});
    })();
  }, [refreshLevel]);

  const ensureGuest = useCallback(async () => {
    const generation = authGenerationRef.current;
    const data = await regAPI.ensureGuest({ persist: false });
    if (!data?.token) return data;
    return commitGuestToken(
      data,
      generation,
      () => authGenerationRef.current,
      () => regAPI.getToken(),
      (guestToken) => storage.set('ur_reg_token', guestToken),
      (guestData) => {
        setHasToken(true);
        setVerificationLevel(guestData.verification_level ?? 0);
      },
    );
  }, []);

  const signIn = (phone, level = 1, token = null, { expectedToken = null, userId = null, isCurrent = () => true } = {}) => runAuthMutation(async () => {
    if (!isCurrent() || (expectedToken && await regAPI.getToken() !== expectedToken) || !isCurrent()) return false;
    legacyBootstrapRef.current = null;
    const recovery = pendingRecoveryRef.current || await readSessionRecovery();
    if (recovery) pendingRecoveryRef.current = await completeSessionRecovery(recovery);
    // Старый маркер не должен пережить успешно принятый вход нового владельца.
    await clearSessionRecovery();
    pauseOutbox(true);
    const generation = ++authGenerationRef.current;
    if (token) {
      await storage.set('ur_reg_token', token);
    }
    const existing = await regAPI.getToken();
    if (!isCurrent()) return false;
    if (!existing) {
      throw new Error('NO_TOKEN');
    }
    // Другая подтверждённая почта не наследует ID/роль прежнего владельца.
    const s = { apiBase: API_BASE, user: { phone, role: null, id: userId } };
    sessionRef.current = s;
    setSession(s);
    setVerificationLevel(level);
    setHasToken(true);
    setRecoveryRequired(false);
    pendingRecoveryRef.current = null;
    await storage.set(KEY, JSON.stringify(s));
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[Auth] login success', { level });
    }
    refreshLevel({ expectedToken: existing, expectedGeneration: generation }).catch(() => {});
    return true;
  });

  const setRole = (role, { expectedToken = null, isCurrent = () => true } = {}) => runAuthMutation(async () => {
    if (!isCurrent() || (expectedToken && await regAPI.getToken() !== expectedToken) || !isCurrent()) {
      return { ok: false, reason: 'SESSION_CHANGED' };
    }
    authGenerationRef.current += 1;
    const prev = sessionRef.current;
    const s = prev ? { ...prev, user: { ...prev.user, role } } : { user: { role, id: 'u_' + Date.now() } };
    sessionRef.current = s;
    setSession(s);
    await storage.set(KEY, JSON.stringify(s));
    return { ok: true };
  });

  const signOut = ({ expectedToken = null, expectedGeneration = null } = {}) => runAuthMutation(async () => {
    // A queued response from the previous account must never log out a newer one.
    if (expectedToken && !await authOwnerIsCurrent(
      expectedToken, expectedGeneration, () => authGenerationRef.current, () => regAPI.getToken(),
    )) return { ok: false, reason: 'SESSION_CHANGED' };
    authGenerationRef.current += 1;
    setAuthExpirySuppressed(true);

    // Do not clear auth state until native tracking is stopped and the durable
    // server-revoke intent has been verified.
    const authToken = await regAPI.getToken();
    // A local logout is not successful while native tracking may still be
    // running. Keep the session/token so the user can retry when Expo/OS fails
    // to confirm stop; do not hide a rejected or timed-out native operation.
    const stopController = new AbortController();
    const trackingResult = await withTimeout(
      stopBackgroundTrackingForLogout(authToken, { signal: stopController.signal }),
      LOGOUT_NETWORK_TIMEOUT_MS,
      () => stopController.abort(),
    );
    if (!trackingResult?.ok) {
      setAuthExpirySuppressed(false);
      return {
        ok: false,
        reason: trackingResult?.reason || 'BACKGROUND_TRACKING_STOP_FAILED',
      };
    }

    // Persist the canonical server revoke BEFORE deleting the last local
    // bearer. A process kill after clearToken used to make offline logout
    // unrecoverable: the next boot had neither token nor retry record.
    try {
      await regAPI.stageLogoutRevoke(authToken);
    } catch {
      const trackingRestore = await withTimeout(
        restoreBackgroundTrackingForLogoutFailure(authToken, trackingResult.stopped),
      );
      // Do not clear the only bearer when the durable revoke intent could not
      // be verified. Retaining the local session is safer than silently
      // creating an unrecoverable server/push ownership window. If GPS was
      // stopped first, restore it for the still-active session before retry.
      setAuthExpirySuppressed(false);
      return {
        ok: false,
        reason: 'PENDING_LOGOUT_REVOKE_NOT_DURABLE',
        trackingRestored: trackingRestore?.ok === true,
      };
    }
    const lastSampleCleanup = await clearBackgroundLocationSampleForLogout(authToken);
    if (lastSampleCleanup?.reason === 'session_changed') {
      setAuthExpirySuppressed(false);
      return { ok: false, reason: 'SESSION_CHANGED' };
    }
    if (!lastSampleCleanup?.ok && typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('[Auth] logout could not clear last GPS sample', lastSampleCleanup?.reason);
    }
    if (await regAPI.getToken() !== authToken) {
      setAuthExpirySuppressed(false);
      return { ok: false, reason: 'SESSION_CHANGED' };
    }
    const ownerId = sessionRef.current?.user?.id;
    sessionRef.current = null;
    setSession(null);
    setVerificationLevel(0);
    setHasToken(false);
    await regAPI.clearToken();
    // Invalidate guest/token work that may have started while stop/staging
    // awaited; queued commits must not resurrect this now-revoked bearer.
    authGenerationRef.current += 1;

    // Badge и dedupe принадлежат текущей локальной сессии. Их нельзя
    // оставлять до следующего пуша или успешного сетевого cleanup: иначе
    // следующий пользователь общего телефона унаследует старое "8" и
    // подавленные event_id. Это локальная операция, поэтому она не зависит
    // от доступности QA2 backend.
    clearAppIconBadge();
    try { await clearPushEventDedup(); } catch {}

    // Блок 2 аудита (P1-3/P1-4): деактивируем push ТЕКУЩЕГО пользователя на
    // backend, пока токен ещё валиден — ОБЯЗАТЕЛЬНО до regAPI.logout()
    // (который отзывает сессию: после него /push/logout-cleanup вернёт 401
    // и деактивация push не выполнится вовсе — не переставлять порядок).
    // Best-effort: сетевая ошибка не блокирует сам logout.
    try {
      await withTimeout(push.logoutCleanup(authToken));
    } catch {}

    try {
      await Promise.all([
        storage.remove(KEY),
        storage.remove('ur_verification_level'),
        storage.remove('ur_driver_vehicle'),
        storage.remove('ur_client_company'),
        storage.remove('ur_pinned_chats'),
        storage.remove('ur_bg_deal_ids'),
        storage.remove('ur_bg_last_location_v1'),
        storage.remove('ur_queue_plate'),
        clearSharedAndOwnedDrafts({ apiBase: API_BASE, ownerId }),
        storage.removeByPrefix('ur_chat_translation_v1:'),
        clearOutboxForUser(ownerId),
        clearQueue(),
      ]);
    } catch {}
    try {
      // QA-аудит P1-7: серверный revoke использует сохранённый в памяти токен;
      // локальный токен уже удалён и навигация не зависит от сети.
      await withTimeout(regAPI.logout(authToken));
    } catch {}
    // Google/Apple are identity providers, not the UrTruck authorization
    // session, but their local Supabase session must also be cleared so a
    // different person on the same device cannot inherit provider state.
    // Timeout-wrapped for the same reason as the calls above — navigation
    // must not stall on a slow/offline provider call.
    try {
      await withTimeout(clearSocialAuthSession());
    } catch {}
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[Auth] logout cleared UrTruck + provider session + push + queues');
    }
    setTimeout(() => setAuthExpirySuppressed(false), 1500);
    return { ok: true };
  });

  useEffect(() => configureAuthExpiryValidation({
    getToken: () => regAPI.getToken(),
    validateToken: (token, options) => regAPI.validateToken(token, options),
  }), []);

  const hasTokenRef = useRef(false);
  useEffect(() => { hasTokenRef.current = hasToken; }, [hasToken]);
  useEffect(() => {
    const unsub = subscribeAuthExpired((rejectedToken) => {
      if (!hasTokenRef.current || !rejectedToken) return;
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[Auth] подтверждён отказ сессии → восстановление входа');
      }
      recoverRejectedSession(rejectedToken, authGenerationRef.current).catch(() => {});
    });
    return unsub;
  }, []);

  return (
    <AuthContext.Provider value={{
      session, verificationLevel, hasToken,
      signIn, signOut, setRole,
      ensureGuest, refreshLevel, loading, recoveryRequired,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
