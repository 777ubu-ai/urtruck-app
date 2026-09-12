# UI Canon Restoration — visual evidence

All screenshots use local Expo web builds and read-only Playwright fixture responses. No production API was contacted and no POST/PUT/DELETE request is used by the fixture.

## Before

- `before/driver-cargo-ru-390x844.png` — `origin/main` at `2bd1bcde`, legacy cargo list.
- `before/shipper-list-ru-390x844.png` — `origin/main` at `2bd1bcde`, legacy shipper list.

## After

- Driver cargo list: RU/EN/KK/ZH at `390x844` and `360x800`.
- Shipper list: RU at `390x844` and `360x800`.
- `after/driver-trips-ru-390x844.png` — Driver → Рейсы.
- `after/driver-cargo-long-route-shymkent-ekaterinburg-390x844.png` — long route fixture.
- `after/country-flags-kz-cn-ru-390x844.png` — shared local ISO SVG fixture; KZ/CN/RU are present.

The final Driver cargo fixture contains 8 cards. Measured full cards above the bottom navigation: 7 at `390x844` and 6 at `360x800`; compact card height is 60px.
