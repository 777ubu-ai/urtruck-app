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
        // PR-C1: /register/me не возвращает city, поэтому дёргаем ещё и
        // /users/me — там есть name/city/about. Делаем параллельно с
        // setSession, чтобы при ошибке хотя бы level+role+phone обновились.
        // profile() fail-tolerant — вернёт null если /users/me недоступен.
        const profile = await regAPI.profile();
        const fullName = profile?.name || me.full_name || null;
        const city = profile?.city || null;
        setSession(prev => {
          const next = prev
            ? {
                ...prev,
                user: {
                  ...prev.user,
                  role: me.role,
                  phone: me.phone,
                  id: me.id,
                  // Не затираем существующие значения, если backend не
                  // вернул новых (offline / 4xx на /users/me).
                  name: fullName || prev.user?.name || null,
                  full_name: fullName || prev.user?.full_name || null,
                  city: city || prev.user?.city || null,
                },
              }
            : {
                user: {
                  role: me.role,
                  phone: me.phone,
                  id: me.id,
                  name: fullName,
                  full_name: fullName,
                  city,
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
        // Нет токена → чистый logout, невозможно состояние "session без token"
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
    // Если передан token — сохраняем. Если нет — проверяем что уже есть в storage.
    if (token) {
      await storage.set('ur_reg_token', token);
    }
    const existing = await regAPI.getToken();
    if (!existing) {
      throw new Error('NO_TOKEN');
    }
    // Сохраняем prev role если уже была — иначе logout-after-login
    // прошёл без потери выбора role и пользователь возвращается на тот
    // же раздел.
    const prevRole = session?.user?.role || null;
    const s = { user: { phone, role: prevRole, id: session?.user?.id || ('u_' + Date.now()) } };
    setSession(s);
    setVerificationLevel(level);
    setHasToken(true);
    await storage.set(KEY, JSON.stringify(s));
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[Auth] login success', { phone, level, role: prevRole });
    }
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
    // RC2 hotfix (P1-2): пользователи жаловались что после OK на
    // "Выйти из аккаунта" они оставались залогинены. Корень — некоторые
    // ключи (ur_driver_vehicle, ur_client_company, лангуаге-state)
    // оставались в storage, а AuthContext только сбрасывал session+token,
    // что иногда приводило к гонкам в AppNavigator.
    // Fix: 1) очищаем ВСЕ известные ur_* ключи; 2) сбрасываем in-memory
    // state ПОСЛЕ storage cleanup; 3) делаем async чтобы вызывающий
    // мог await перед reset навигации.
    try {
      await Promise.all([
        storage.remove(KEY),                    // ur_session
        storage.remove('ur_verification_level'),
        storage.remove('ur_driver_vehicle'),    // batch-2 локальный профиль
        storage.remove('ur_client_company'),    // batch-2 локальный профиль
      ]);
    } catch {}
    try {
      await regAPI.clearToken();                // ur_reg_token
    } catch {}
    setSession(null);
    setVerificationLevel(0);
    setHasToken(false);
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[Auth] logout cleared session + storage');
    }
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
