import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IS_BETA as CANONICAL_IS_BETA } from './env';

// === НАСТРОЙКИ ===
// Проект: UrTruck (eu-central-1, ACTIVE_HEALTHY).
// 2026-08-21 P0: коммит 32116e1 (27.05.2026, «миграция на новый проект...
// SAKURA-Empire PRO») переключил URL/anon key на hchmnocoxjvtgdamcmmi —
// этот hostname с тех пор не резолвится вообще нигде (подтверждено с
// прод-сервера, GitHub Actions runner'а и независимой третьей сети;
// Supabase MCP этого аккаунта такого проекта в списке не видит вовсе —
// PRO-проект, судя по всему, не удержался). Откат на старый живой проект
// pymddxenwtjcbmrafvnc — подтверждён как ACTIVE_HEALTHY через Supabase
// MCP прямо перед откатом, anon key ниже — актуальный (не из истории git),
// получен тем же MCP-запросом. В нём уже реально существует нужный
// storage bucket urtruck-docs (создан 2026-08-10).
export const SUPABASE_URL = 'https://pymddxenwtjcbmrafvnc.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bWRkeGVud3RqY2JtcmFmdm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTk1NzMsImV4cCI6MjA5MTU3NTU3M30.hXS6gND9ChXeJ9MxGrsgfi1frOqsc-kQpwP5ZglcBQs';

// Beta период — всё бесплатно + универсальный OTP (см. backend BETA_MODE).
// Контролируется EXPO_PUBLIC_IS_BETA. Для production: build с
// EXPO_PUBLIC_IS_BETA=false (npx expo export ...) и переключить backend
// BETA_MODE=false в .env на сервере.
//
// Release-hardening track 2, item 3: this used to be a SECOND, independent
// computation of IS_BETA (default `true` unconditionally, with no
// APP_ENV/production check at all) — unlike env.js's version, which
// defaults to `false` specifically when APP_ENV === 'production'. Since
// eas.json's production build profile never sets EXPO_PUBLIC_IS_BETA,
// this file's own IS_BETA silently resolved to `true` in a real production
// build (ProfileScreen.js, its one consumer, would show the beta-pricing
// note to paying-production users) while env.js's IS_BETA correctly
// resolved to `false` for that exact same build — two sources of truth
// disagreeing specifically in production, the ambiguity this fixes.
// Re-exported from env.js (the canonical source) instead of recomputed —
// never redefine this independently again.
export const IS_BETA = CANONICAL_IS_BETA;

// Цена за контакт (когда beta закончится)
export const CONTACT_PRICE = 1; // $1

// Supabase клиент с AsyncStorage для сохранения сессии
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
