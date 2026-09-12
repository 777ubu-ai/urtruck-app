# PR #356 UI recheck evidence

This directory contains read-only web visual evidence captured from the local
web bundle on branch `design/ui-canon-restoration-20260912`.

- viewport matrix: `390x844` and `360x800`;
- locales: `RU`, `EN`, `KK`, `ZH`;
- themes: `light`, `dark`, `system` for the main list smoke;
- fixtures: eight cargo/trip rows, including `Шымкент → Екатеринбург`, KZ/CN/RU;
- flags: bundled SVGs plus neutral unknown ISO `XX`;
- Deals screenshots use read-only intercepted `/market/my` fixtures and show
  seven full compact cards at `390x844`;
- the global browser push-permission banner was removed only from the isolated
  screenshot DOM after its action state, so list density is measured for the
  product screen rather than the unrelated global permission surface;
- no POST/PUT/DELETE request was enabled and no production endpoint was used.

Key evidence files:

- `driver-cargo-RU-light-390x844.png`
- `driver-cargo-RU-light-360x800.png`
- `driver-cargo-RU-dark-390x844.png`
- `driver-trips-RU-light-390x844.png`
- `shipper-list-RU-light-390x844.png`
- `shipper-list-ZH-light-390x844.png`
- `deals-driver-RU-light-390x844.png`
- `deals-shipper-RU-light-390x844.png`
- `queue-driver-RU-light-390x844.png`
- `cargo-detail-RU-light-390x844.png`
- `driver-detail-RU-light-390x844.png`
- `profile-guest-RU-light-390x844.png`
- `country-flags-KZ-CN-RU-light-390x844.png`

The complete locale/viewport matrix is present in the same directory.
