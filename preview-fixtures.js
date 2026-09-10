// Public GitHub Pages visual-QA fixture mode.
// Enabled only by `?fixture=visual`; it never contacts an API and rejects
// every non-GET request. This file exists only in the Pages artifact branch.
(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('fixture') !== 'visual') return;

  const cargos = [
    { id: 'fixture-cargo-kz-ru', from_city: 'Алматы', from_country: 'KZ', to_city: 'Москва', to_country: 'RU', cargo_desc: 'Бытовая техника, в коробках', cargo_type: 'tent', weight_tons: 12, volume_m3: 45, price: 7777, currency: 'USD', pickup_date: '2026-09-17', status: 'active' },
    { id: 'fixture-cargo-cn-kz', from_city: 'Урумчи', from_country: 'CN', to_city: 'Алматы', to_country: 'KZ', cargo_desc: 'Стройматериалы', cargo_type: 'tent', weight_tons: 10, volume_m3: 40, price: 6400, currency: 'USD', pickup_date: '2026-09-16', status: 'active' },
    { id: 'fixture-cargo-cn-ru', from_city: 'Урумчи', from_country: 'CN', to_city: 'Новосибирск', to_country: 'RU', cargo_desc: 'Продукты питания', cargo_type: 'ref', weight_tons: 8, volume_m3: 20, price: 9800, currency: 'USD', pickup_date: '2026-09-18', status: 'active' },
    { id: 'fixture-cargo-kz-long', from_city: 'Шымкент', from_country: 'KZ', to_city: 'Екатеринбург', to_country: 'RU', cargo_desc: 'Промышленные товары', cargo_type: 'tent', weight_tons: 9, volume_m3: 38, price: 5500, currency: 'USD', pickup_date: '2026-09-20', status: 'active' },
  ];
  const trips = [
    { id: 'fixture-trip-kz-cn', from_city: 'Алматы', from_country: 'KZ', to_city: 'Урумчи', to_country: 'CN', truck_type: 'tent', capacity_tons: 20, available_m3: 82, price: 4500, currency: 'USD', departure_date: '2026-09-17', driver_name: 'Серик', status: 'active' },
    { id: 'fixture-trip-ru-kz', from_city: 'Москва', from_country: 'RU', to_city: 'Алматы', to_country: 'KZ', truck_type: 'ref', capacity_tons: 18, available_m3: 70, price: 6200, currency: 'USD', departure_date: '2026-09-18', driver_name: 'Алексей', status: 'active' },
    { id: 'fixture-trip-uz-kz', from_city: 'Ташкент', from_country: 'UZ', to_city: 'Шымкент', to_country: 'KZ', truck_type: 'tent', capacity_tons: 22, available_m3: 90, price: 3900, currency: 'USD', departure_date: '2026-09-19', driver_name: 'Илья', status: 'active' },
  ];
  const dashboard = { my_trips: trips, my_cargos: cargos, my_bids: [], incoming_bids: [], my_deals: [] };
  const originalFetch = window.fetch.bind(window);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  window.localStorage.setItem('ur_reg_token', 'preview-read-only-token');
  window.fetch = async (input, init = {}) => {
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.origin);
    if (!url.pathname.startsWith('/api/')) return originalFetch(input, init);
    if (method !== 'GET') return json({ detail: 'Preview fixture mode is read-only' }, 405);
    if (url.pathname.endsWith('/market/cargos')) return json({ cargos, total: cargos.length });
    if (url.pathname.endsWith('/market/trips')) return json({ trips, total: trips.length });
    if (url.pathname.endsWith('/market/my')) return json(dashboard);
    if (url.pathname.includes('/favorites')) return json({ favorites: [{ item_id: 'fixture-cargo-kz-ru' }, { item_id: 'fixture-trip-kz-cn' }] });
    if (url.pathname.includes('/unread')) return json({ unread: 0, count: 0, total: 0 });
    if (url.pathname.includes('/notifications')) return json({ notifications: [], unread: 0 });
    return json({});
  };
  window.__URTRUCK_PREVIEW_FIXTURE__ = 'read-only';
})();
