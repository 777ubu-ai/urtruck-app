#!/usr/bin/env node

const API_BASE = process.env.API_BASE || 'https://urtruck.kz/api/v1';
const REVIEWER_EMAIL = process.env.REVIEWER_EMAIL || 'appreview@urtruck.kz';
const REVIEWER_CODE = process.env.REVIEWER_CODE || '1975';

const now = new Date();
const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const cargoDesc = `GPC reviewer self deal ${stamp}`;
const cargoPayload = {
  from_country: 'KZ',
  from_region: 'Almaty',
  from_city: 'Almaty',
  to_country: 'KZ',
  to_region: 'Astana',
  to_city: 'Astana',
  cargo_type: 'general',
  cargo_desc: cargoDesc,
  weight_tons: 20,
  volume_m3: 82,
  price: 2500,
  currency: 'USD',
  payment_type: 'cash',
  truck_type: 'tent',
  body_type: 'tent',
  pickup_date: now.toISOString().slice(0, 10),
};

async function api(path, { method = 'GET', token, body, headers = {} } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body == null ? undefined : JSON.stringify(body),
  });

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${raw}`);
  }

  return data;
}

async function setRole(token, role) {
  const body = role === 'client'
    ? { role: 'client', name: 'App Review Demo', country: 'KZ', phone: '+77000009999' }
    : { role: 'driver', phone: '+77000009999' };
  await api('/users/me', { method: 'PATCH', token, body });
}

async function postJson(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }
  if (!response.ok) {
    throw new Error(`POST ${path} failed: ${response.status} ${raw}`);
  }
  return data;
}

const sendResult = await postJson('/register/email/send', {
  email: REVIEWER_EMAIL,
  consent: true,
});
if (!sendResult?.sent) {
  throw new Error(`Reviewer email send returned unexpected payload: ${JSON.stringify(sendResult)}`);
}

const verifyResult = await postJson('/register/email/verify', {
  email: REVIEWER_EMAIL,
  code: REVIEWER_CODE,
});
const token = verifyResult?.token;
if (!token) {
  throw new Error(`Reviewer email verify did not return token: ${JSON.stringify(verifyResult)}`);
}

await setRole(token, 'client');
const cargo = await api('/market/cargos', { method: 'POST', token, body: cargoPayload });
const cargoId = cargo?.id;
if (!cargoId) {
  throw new Error(`Cargo creation returned unexpected payload: ${JSON.stringify(cargo)}`);
}

await setRole(token, 'driver');
const bid = await api('/market/bids', {
  method: 'POST',
  token,
  body: {
    cargo_id: cargoId,
    amount: 2500,
    currency: 'USD',
    note: 'Google Play reviewer GPS consent proof',
  },
});
const bidId = bid?.id;
if (!bidId) {
  throw new Error(`Bid creation returned unexpected payload: ${JSON.stringify(bid)}`);
}

await setRole(token, 'client');
const accepted = await api(`/market/bids/${bidId}/accept`, { method: 'POST', token, body: {} });
const dealId = accepted?.deal_id;
if (!dealId) {
  throw new Error(`Bid accept returned unexpected payload: ${JSON.stringify(accepted)}`);
}

await setRole(token, 'driver');
const me = await api('/register/me', { token });

const payload = {
  reviewerEmail: REVIEWER_EMAIL,
  cargoDesc,
  cargoId,
  bidId,
  dealId,
  chatRoomId: accepted?.chat_room_id || null,
  reviewerId: me?.id || null,
  reviewerRole: me?.role || null,
  pickupDate: cargoPayload.pickup_date,
  fromCity: cargoPayload.from_city,
  toCity: cargoPayload.to_city,
};

process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
