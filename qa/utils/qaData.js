// Generators for QA payloads. Every record carries QA_TAG so the cleanup
// script can find it. Description fields embed the tag inside square brackets
// so it's visually obvious in screenshots / DB rows but doesn't disturb
// route/city display the way a prefix in `from_city` would.

const { QA_TAG } = require('./qaConfig');

const tag = () => QA_TAG;

// Trip published by Serik (driver QA). Matches the acceptance fixture from
// the user's task: Алматы → Москва, fixed price 12000 USD, tent.
function serikTripPayload(overrides = {}) {
  return {
    from_city: 'Алматы',
    to_city: 'Москва',
    transit: tag(),                 // marker lives in transit, never blocks UI
    truck_type: 'tent',
    capacity_tons: 20,
    available_m3: 82,
    price: 12000,
    currency: 'USD',
    departure: '2026-05-06',
    arrival: '2026-05-08',
    ...overrides,
  };
}

// Cargo published by Boris (shipper QA). Хоргос → Алматы, 5000 USD.
function borisCargoPayload(overrides = {}) {
  return {
    from_city: 'Хоргос',
    to_city: 'Алматы',
    // Avoid the literal "qa" / "тест" substrings — backend's DIRTY_TOKENS
    // filter would silently hide the row from list_cargos otherwise. The
    // QA_TAG itself ("[ar-...]") is by design free of dirty substrings.
    cargo_desc: `Партия Boris ${tag()}`,
    cargo_type: 'tent',
    weight_tons: 10,
    volume_m3: 40,
    price: 5000,
    currency: 'USD',
    // Дата загрузки — динамически +14 дней (бэкенд отклоняет дату в прошлом;
    // раньше был захардкоженный день, который со временем протух).
    pickup_date: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
    photos: [],
    ...overrides,
  };
}

// Bid Serik places on Boris' cargo.
function serikBidPayload(cargoId, overrides = {}) {
  return {
    cargo_id: cargoId,
    amount: 4800,
    message: `Bid Serik ${tag()}`,
    ...overrides,
  };
}

// Patches Serik tries on his own trip (price update flow).
function serikTripEditPayload(overrides = {}) {
  return {
    price: 13000,
    currency: 'USD',
    ...overrides,
  };
}

module.exports = {
  tag,
  serikTripPayload,
  borisCargoPayload,
  serikBidPayload,
  serikTripEditPayload,
};
