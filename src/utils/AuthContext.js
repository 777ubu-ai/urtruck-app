import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { storage } from './storage';
import { regAPI } from './registration';
import { clearSocialAuthSession } from './socialAuth';
import { subscribeAuthExpired, setAuthExpirySuppressed } from './authEvents';
import { push } from './push';
import { clearOutbox } from './outbox';
import { clearQueue } from './offlineQueue';

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

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [verificationLevel, setVerificationLevel] = useState(0);
  const [hasToken, setHasToken] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshLevel = useCallback(async () => {
    const me = await regAPI.me();
    if (me && typeof me.verification_level === 'number') {
      setVerificationLevel(me.verification_level);
      const hasRealRole = me.role && me.role !== 'guest';
      if (me.id || hasRealRole) {
        const profile = hasRealRole ? await regAPI.profile() : null;
        const fullName = profile?.name || me.full_name || null;
        const city = profile?.city || null;
        setSession(prev => {
          const base = prev?.user || {};
          const next = {
            ...(prev || {}),
            user: {
              ...base,
              role: hasRealRole ? me.role : (base.role || null),
              phone: me.phone || base.phone,
              id: me.id || base.id,
              name: fullName || base.name || null,
              full_name: fullName || base.full_name || null,
              city: city || base.city || null,
            },
          };
          storage.set(KEY, JSON.stringify(next));
          return next;
        });
      }
    }
    return me;
  }, []);

  useEffect(() => {
    (async () => {
      const token = await regAPI.getToken();
      if (!token) {
        await storage.remove(KEY);
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
        try { restored = JSON.parse(raw); setSession(restored); } catch {}
      }
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
    const data = await regAPI.ensureGuest();
    if (data?.token) {
      setHasToken(true);
      setVerificationLevel(data.verification_level ?? 0);
    }
    return data;
  }, []);

  const signIn = async (phone, level = 1, token = null) => {
    if (token) {
      await storage.set('ur_reg_token', token);
    }
    const existing = await regAPI.getToken();
    if (!existing) {
      throw new Error('NO_TOKEN');
    }
    const prevRole = session?.user?.role || null;
    const s = { user: { phone, role: prevRole, id: session?.user?.id || ('u_' + Date.now()) } };
    setSession(s);
    setVerificationLevel(level);
    setHasToken(true);
    await storage.set(KEY, JSON.stringify(s));
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[Auth] login success', { identifier: phone, level, role: prevRole });
    }
    refreshLevel().catch(() => {});
    return true;
  };

  const setRole = (role) => {
    setSession(prev => {
      const s = prev ? { ...prev, user: { ...prev.user, role } } : { user: { role, id: 'u_' + Date.now() } };
      storage.set(KEY, JSON.stringify(s));
      return s;
    });
  };

  const signOut = async () => {
    setAuthExpirySuppressed(true);

    try {
      await push.logoutCleanup();
    } catch {}

    try {
      await Promise.all([
        storage.remove(KEY),
        storage.remove('ur_verification_level'),
        storage.remove('ur_driver_vehicle'),
        storage.remove('ur_client_company'),
        storage.remove('ur_pinned_chats'),
        storage.remove('ur_bg_deal_ids'),
        storage.remove('ur_queue_plate'),
        storage.removeByPrefix('ur_draft_'),
        clearOutbox(),
        clearQueue(),
      ]);
    } catch {}
    try {
      // Server-side revoke while the UrTruck token is still available.
      await regAPI.logout();
    } catch {}
    try {
      await regAPI.clearToken();
    } catch {}
    // Google/Apple are identity providers, not the UrTruck authorization
    // session, but their local Supabase session must also be cleared so a
    // different person on the same device cannot inherit provider state.
    try {
      await clearSocialAuthSession();
    } catch {}

    setSession(null);
    setVerificationLevel(0);
    setHasToken(false);
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[Auth] logout cleared UrTruck + provider session + push + queues');
    }
    setTimeout(() => setAuthExpirySuppressed(false), 1500);
  };

  const hasTokenRef = useRef(false);
  useEffect(() => { hasTokenRef.current = hasToken; }, [hasToken]);
  useEffect(() => {
    const unsub = subscribeAuthExpired(() => {
      if (!hasTokenRef.current) return;
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[Auth] session expired (401) → auto signOut');
      }
      signOut();
    });
    return unsub;
  }, []);

  return (
    <AuthContext.Provider value={{
      session, verificationLevel, hasToken,
      signIn, signOut, setRole,
      ensureGuest, refreshLevel, loading,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
