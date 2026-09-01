# Positive deal deeplink room-membership fix

Direct deal deeplinks are resolved through `chatAPI.rooms()` for the current authenticated user. A workspace is opened only when the exact `deal_id` has a room in that user-scoped list. The resolved route carries an internal `verifiedDealAccess` flag so `DealWorkspaceRoute` does not perform a second membership network probe.

Expected physical matrix for deal `88C842D6-B879-4266-A2C8-DA32818A137B`:
- Berik (loser): DENIED
- Armando (winner): ALLOWED
- Fedya (shipper): ALLOWED
