# Driver push production gate

Release-blocking check for the reported case: shipper creates an offer on a driver's trip and the driver must receive a push.

## Automated assertions

- `backend/tests/test_push_delivery_regressions.py` verifies trip-bid routing targets `driver_id`.
- Expo `InvalidCredentials` must never deactivate the recipient's device token.
- `GET /security/api/v1/push/info` exposes only aggregate active registration counts (no raw token/user data).

## Production verification after deploy

1. Confirm `/security/api/v1/push/info` reports active native registrations for the relevant platform.
2. Submit one real test offer from shipper to a test driver's active trip.
3. Confirm an Expo push ticket is accepted and the device receives the notification in background/locked state.
4. Confirm tap opens `/trips/{trip_id}?bid={bid_id}` in the correct driver context.
5. If delivery fails, inspect Expo ticket/credential error before changing/deactivating the device token.

A green CI run proves routing/build/regression only. Physical-device delivery remains unproven until step 3 is observed on the real driver device.
