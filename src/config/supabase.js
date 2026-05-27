import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// === НАСТРОЙКИ ===
// Проект: SAKURA-Empire PRO org → UrTruck (Central EU / Frankfurt)
// Создан 2026-05-27, миграция со старого free-проекта pymddxenwtjcbmrafvnc.
const SUPABASE_URL = 'https://hchmnocoxjvtgdamcmmi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjaG1ub2NveGp2dGdkYW1jbW1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NzE5NzksImV4cCI6MjA5NTQ0Nzk3OX0.R9WsnFVg6g0n7TdBwAJ-YjDM5K3GWVLX__FZY16u2Yw';

// Beta период — всё бесплатно + универсальный OTP (см. backend BETA_MODE).
// Контролируется EXPO_PUBLIC_IS_BETA. Default true.
// Для production: build с EXPO_PUBLIC_IS_BETA=false (npx expo export ...) и
// переключить backend BETA_MODE=false в .env на сервере.
const _envBeta = (typeof process !== 'undefined' && process.env)
  ? process.env.EXPO_PUBLIC_IS_BETA
  : undefined;
export const IS_BETA = _envBeta === undefined ? true : _envBeta !== 'false';

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
