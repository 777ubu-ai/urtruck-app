# Shipper cards + driver push change log

- Central place display now strips legacy embedded flag emoji for RU/KK as well as ZH/EN.
- Shared marketplace `FeedCard` was rebuilt around route-first hierarchy.
- Heart favorites were replaced with outline/filled bookmark states.
  **Revert 2026-08-19**: this was the root cause of a production bug (heart
  icon in «Избранное» vs. bookmark on feed cards — visual inconsistency,
  reported by owner with screenshots). Reverted back to heart everywhere;
  see `tests/frontend/shipper_cards_unified.test.mjs` and
  `qa/utils/favoritesContractSmoke.js`.
- Price styling was reduced and moved below the route in the shared card.
- My cargo route typography was strengthened; price no longer uses orange.
- Expo `InvalidCredentials` no longer invalidates a driver's token; only `DeviceNotRegistered` deactivates a device registration.
- Push diagnostics expose safe aggregate counts for web/native/iOS/Android active registrations.
- Regression tests cover trip-offer → `driver_id` push routing and the token-invalidating rule.
- Web version bumped to 108 and service-worker epoch bumped for a forced frontend refresh.
