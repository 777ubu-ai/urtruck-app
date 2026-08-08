// CGR API клиент — онлайн-табло границ + брони CarGoRuqsat.
// Backend: /api/v1/borders/scoreboard, /bookings (ТЗ-CGR-001 v1.1 §3.1, §3.2).
import { storage } from './storage';
import { API_BASE } from '../config/env';

const BASE = `${API_BASE}/borders`;
const TOKEN_KEY = 'ur_reg_token';

async function authHeaders() {
  const token = await storage.get(TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function jsonOrThrow(response) {
  let body = null;
  try {
    body = await response.json();
  } catch (_) {
    // not json
  }
  if (!response.ok) {
    const detail = body && typeof body.detail === 'string' ? body.detail : `HTTP ${response.status}`;
    const err = new Error(detail);
    err.status = response.status;
    err.body = body;
    throw err;
  }
  return body;
}

// ────────────────────────────────────────────────────────────────
// Scoreboard (live-табло, public — без авторизации)
// ────────────────────────────────────────────────────────────────
export async function fetchScoreboard() {
  const r = await fetch(`${BASE}/scoreboard`, { method: 'GET' });
  return jsonOrThrow(r);
}

// ────────────────────────────────────────────────────────────────
// Bookings (привязка номера CGR-брони к рейсу UrTruck)
// ────────────────────────────────────────────────────────────────
export async function createBooking({ tripId = null, bookingNumber, checkpointCode = null }) {
  if (!bookingNumber || bookingNumber.trim().length < 3) {
    const err = new Error('booking_number too short');
    err.status = 400;
    throw err;
  }
  const headers = await authHeaders();
  const r = await fetch(`${BASE}/bookings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      trip_id: tripId,
      booking_number: bookingNumber.trim(),
      checkpoint_code: checkpointCode,
    }),
  });
  return jsonOrThrow(r);
}

export async function fetchActiveBookings() {
  const headers = await authHeaders();
  const r = await fetch(`${BASE}/bookings/active`, { method: 'GET', headers });
  return jsonOrThrow(r);
}

export async function fetchBooking(bookingId) {
  const headers = await authHeaders();
  const r = await fetch(`${BASE}/bookings/${encodeURIComponent(bookingId)}`, {
    method: 'GET',
    headers,
  });
  return jsonOrThrow(r);
}

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────
export function cgrBookingUrl() {
  // UTM-метки (TZ §3.2) — чтобы АО «ИУЦ» видели входящий трафик от UrTruck
  return 'https://cgr.qoldau.kz/ru/start?utm_source=urtruck&utm_medium=app&utm_campaign=booking_redirect';
}

export function checkpointStatusColor(status) {
  // 'ok' | 'stale' | 'unavailable' | 'legacy_mock'
  if (status === 'ok') return '#168759';
  if (status === 'stale') return '#D97706';
  if (status === 'legacy_mock') return '#94A3B8';
  return '#EF4444'; // unavailable
}
