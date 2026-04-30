const { test, expect, request: playwrightRequest } = require('@playwright/test');

const API = 'https://urtruck.kz/api/v1';

test('API smoke: create driver trip and client cargo', async () => {
  const request = await playwrightRequest.newContext({
    ignoreHTTPSErrors: true,
  });

  try {
    const driverGuest = await request.post(`${API}/register/guest`, {
      data: { role: 'driver' },
    });
    expect(driverGuest.ok()).toBeTruthy();

    const driverData = await driverGuest.json();
    expect(driverData.token).toBeTruthy();

    const tripPayload = {
      from_city: 'Тест QA Водитель',
      to_city: 'Тест QA Маршрут',
      truck_type: 'tent',
      capacity_tons: 22,
      available_m3: 90,
      price: 0,
      departure: '2026-05-10',
      arrival: '2026-05-12',
    };

    const createTrip = await request.post(`${API}/market/trips`, {
      headers: {
        Authorization: `Bearer ${driverData.token}`,
      },
      data: tripPayload,
    });

    expect(createTrip.ok()).toBeTruthy();

    const tripResult = await createTrip.json();
    expect(tripResult.ok).toBeTruthy();
    expect(tripResult.id).toBeTruthy();

    const tripsList = await request.get(`${API}/market/trips`);
    expect(tripsList.ok()).toBeTruthy();

    const tripsData = await tripsList.json();
    const createdTrip = (tripsData.trips || []).find(t => t.id === tripResult.id);
    expect(createdTrip).toBeTruthy();
    expect(createdTrip.from_city).toContain('Тест QA Водитель');

    const clientGuest = await request.post(`${API}/register/guest`, {
      data: { role: 'client' },
    });
    expect(clientGuest.ok()).toBeTruthy();

    const clientData = await clientGuest.json();
    expect(clientData.token).toBeTruthy();

    const cargoPayload = {
      from_city: 'Тест QA Клиент',
      to_city: 'Тест QA Груз',
      cargo_desc: 'Автотестовый груз Playwright',
      cargo_type: 'general',
      weight_tons: 20,
      volume_m3: 120,
      truck_type: 'tent',
      price: 3500,
      pickup_date: '2026-05-11',
    };

    const createCargo = await request.post(`${API}/market/cargos`, {
      headers: {
        Authorization: `Bearer ${clientData.token}`,
      },
      data: cargoPayload,
    });

    expect(createCargo.ok()).toBeTruthy();

    const cargoResult = await createCargo.json();
    expect(cargoResult.ok).toBeTruthy();
    expect(cargoResult.id).toBeTruthy();

    const cargosList = await request.get(`${API}/market/cargos`);
    expect(cargosList.ok()).toBeTruthy();

    const cargosData = await cargosList.json();
    const createdCargo = (cargosData.cargos || []).find(c => c.id === cargoResult.id);
    expect(createdCargo).toBeTruthy();
    expect(createdCargo.cargo_desc).toContain('Автотестовый груз Playwright');
  } finally {
    await request.dispose();
  }
});
