import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// === НАСТРОЙКИ ===
// Замени на свои данные из Supabase → Settings → API
const SUPABASE_URL = 'https://pymddxenwtjcbmrafvnc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5bWRkeGVud3RqY2JtcmFmdm5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTk1NzMsImV4cCI6MjA5MTU3NTU3M30.hXS6gND9ChXeJ9MxGrsgfi1frOqsc-kQpwP5ZglcBQs';

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
