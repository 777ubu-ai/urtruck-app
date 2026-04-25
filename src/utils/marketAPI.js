// Marketplace API — грузы, рейсы, ставки через сервер
import { storage } from './storage';
import { API_BASE } from '../config/env';

const BASE = `${API_BASE}/market`;

const TOKEN_KEY = 'ur_reg_token';

async function headers() {
  const token = await storage.get(TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

export const marketAPI = {
  // ─── Cargos ───
  async createCargo(data) {
    const r = await fetch(`${BASE}/cargos`, {
      method: 'POST', headers: await headers(),
      body: JSON.stringify(data),
    });
    return r.json();
  },

  async listCargos({ status = 'active', fromCity = '', toCity = '', cargoType = '', limit = 50, offset = 0 } = {}) {
    const params = new URLSearchParams({ status, from_city: fromCity, to_city: toCity, cargo_type: cargoType, limit, offset });
    const r = await fetch(`${BASE}/cargos?${params}`);
    return r.json();
  },

  async getCargo(id) {
    const r = await fetch(`${BASE}/cargos/${id}`);
    return r.json();
  },

  async deleteCargo(id) {
    const r = await fetch(`${BASE}/cargos/${id}`, { method: 'DELETE', headers: await headers() });
    return r.json();
  },

  // ─── Trips ───
  async createTrip(data) {
    const r = await fetch(`${BASE}/trips`, {
      method: 'POST', headers: await headers(),
      body: JSON.stringify(data),
    });
    return r.json();
  },

  async listTrips({ status = 'active', fromCity = '', toCity = '', truckType = '', limit = 50 } = {}) {
    const params = new URLSearchParams({ status, from_city: fromCity, to_city: toCity, truck_type: truckType, limit });
    const r = await fetch(`${BASE}/trips?${params}`);
    return r.json();
  },

  async getTrip(id) {
    const r = await fetch(`${BASE}/trips/${id}`);
    return r.json();
  },

  // ─── Bids ───
  async createBid(data) {
    const r = await fetch(`${BASE}/bids`, {
      method: 'POST', headers: await headers(),
      body: JSON.stringify(data),
    });
    return r.json();
  },

  async listBids({ cargoId, tripId } = {}) {
    const params = new URLSearchParams();
    if (cargoId) params.set('cargo_id', cargoId);
    if (tripId) params.set('trip_id', tripId);
    const r = await fetch(`${BASE}/bids?${params}`);
    return r.json();
  },

  async acceptBid(bidId) {
    const r = await fetch(`${BASE}/bids/${bidId}/accept`, {
      method: 'POST', headers: await headers(),
    });
    return r.json();
  },

  // ─── My Dashboard ───
  async myDashboard() {
    const r = await fetch(`${BASE}/my`, { headers: await headers() });
    return r.json();
  },

  // ─── Drivers (approved, для клиентов) ───
  async listDrivers({ truckType = '' } = {}) {
    const params = new URLSearchParams({ truck_type: truckType });
    const r = await fetch(`${BASE}/drivers?${params}`);
    return r.json();
  },
};
