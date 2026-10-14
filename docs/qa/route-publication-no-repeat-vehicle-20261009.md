# Route publication without repeat vehicle registration

Owner decision 2026-10-09: a signed-in driver must not be forced to fill another vehicle form while publishing a route. Vehicle management remains available in Profile and Border; no saved vehicles or production records are deleted. This does not introduce or promise a paid Pro access gate.

## Pre-flight

Branch `fix/route-publication-no-repeat-vehicle-20261009`, base `c7f541a`; module A3 with A1/A2/S1 dependencies. Files: MyTripsScreen, relevant onboarding test, new actual-handler test, this report. Previously established delivery/route/device evidence is not transferred to this candidate; the installed owner's source SHA is unknown. Protected: onboarding, Pro/verification eligibility, backend ownership checks, multiple-vehicle binding, profile/border management, GPS, flags, push and chat. Rollback: revert this isolated commit. No server change, credential change or build dispatch.

## Confirmed root cause in the publication entry path

Old handler converted every failed `vehicleAPI.list()` response into an empty list and routed zero-length lists into VehicleSetupCountry. A failed session/network request could therefore prompt another vehicle form even if a saved vehicle existed. This is a proven handler behavior; it does not establish why the owner's token expired.

New behavior: HTTP/API failure or malformed vehicle list produces an error without navigation. A successfully empty garage opens CreateTrip directly. One saved vehicle is reused with its id/data; multiple vehicles open the existing chooser with explicit CreateTrip origin. In-flight double taps are coalesced, and unmounted screens cannot navigate after response. The server still authorizes driver publication and validates explicit vehicle ownership; it auto-binds a sole vehicle and requires a choice for multiple vehicles. No backend eligibility rule is weakened.

The route's transport/capacity/volume remain meaningful listing information. Identity, country registration, make/model and plate are not re-entered in a mandatory additional vehicle form during this route entry. Initial onboarding and explicit add/edit actions remain separate flows and are not claimed removed by this patch.

## Validation

Graphify pre-change affected MyTrips scope: 5 nodes, 101 connected edges. Nine actual-handler VM cases cover zero/one/multiple vehicles, session/network/malformed failures, thrown network failure, double tap and unmount. Target suite 36/36 PASS; full local frontend/unit suite 1140/1140 PASS; syntax lint 485 active JS files PASS. Earlier static test explicitly requiring the old publication preflight shape updated to the owner's new no-repeat requirement; existing onboarding, profile and border contracts retained.

Physical iPhone/Android publication and backend/E2E CI are pending. Not installed on phones and not included in already built/dispatched artifacts. Original session-expiry and keyboard symptoms are not declared fully fixed by removing this repeat step.
