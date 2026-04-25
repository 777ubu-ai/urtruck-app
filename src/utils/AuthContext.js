import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { storage } from './storage';
import { regAPI } from './registration';

// Уровни доверия (lazy registration)
// 0 = guest — только смотрит ленту
// 1 = phone — телефон подтверждён, может сохранять
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
      if (me.role && me.role !== 'guest') {
        setSession(prev => {
          const next = prev
            ? { ...prev, user: { ...prev.user, role: me.role, phone: me.phone, id: me.id } }
            : { user: { role: me.role, phone: me.phone, id: me.id } };
          storage.set(KEY, JSON.stringify(next));
          return next;
        });
      }
    }
    return me;
  }, []);

  useEffect(() => {
    (async () => {
      const raw = await storage.get(KEY);
      if (raw) {
        try { setSession(JSON.parse(raw)); } catch {}
      }
      const token = await regAPI.getToken();
      setHasToken(!!token);
      const savedLevel = await regAPI.getLevel();
      setVerificationLevel(savedLevel);
      setLoading(false);
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

  const signIn = (phone, level = 1) => {
    const s = { user: { phone, role: null, id: 'u_' + Date.now() } };
    setSession(s);
    setVerificationLevel(level);
    setHasToken(true);
    storage.set(KEY, JSON.stringify(s));
  };

  const setRole = (role) => {
    setSession(prev => {
      const s = prev ? { ...prev, user: { ...prev.user, role } } : { user: { role, id: 'u_' + Date.now() } };
      storage.set(KEY, JSON.stringify(s));
      return s;
    });
  };

  const signOut = () => {
    setSession(null);
    setVerificationLevel(0);
    setHasToken(false);
    storage.remove(KEY);
    regAPI.clearToken();
  };

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
