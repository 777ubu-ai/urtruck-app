# Site store landing and legacy file-link audit

Date: 2026-11-12. Source before the test-only addition: `e2f7b168286380bd2967434ed3a829fa8b8d0df3`. No production, QA2, mobile installation, or store write was performed.

## Store landing

The production build flag `URTRUCK_PUBLIC_STORE_LANDING=1` makes `scripts/finalize-web-export.mjs` emit the static landing. QA2 continues to build the web app. The landing runtime detects Android, iPhone/iPad/iPod, and touch iPadOS. On detected mobile platforms it calls `location.assign()` to the relevant official listing after 450 ms, at most once per tab session. The store buttons remain visible if browser handoff is blocked or the user returns. Desktop gets both store buttons and QR images. This is an automatic browser handoff attempt; it does not install the app. The in-app browser case was simulated in Playwright, not tested on a physical device.

Official destinations in the source:

- Google Play: `https://play.google.com/store/apps/details?id=com.urtruck.app` — direct request returned HTTP 200 and HTML for the listing. This does not prove install availability in every country/account.
- App Store Kazakhstan: `https://apps.apple.com/kz/app/urtruck/id6764504167` — official listing opened and shows UrTruck, version 1.0.15. This does not identify the published build number/source.

Screenshots `android.png`, `ios.png`, and `desktop.png` are Chromium viewport simulations of the local static production variant. They are not device screenshots. `dist-sha256.txt` contains hashes for the 288 generated files (about 32 MB); `dist/build-info.json` identifies `e2f7b168...`.

Local checks after building that variant:

- `node tests/frontend/test_public_store_landing.mjs` — PASS, including Android/iOS platform detection, callback restoration, and one-attempt loop guard.
- `npx playwright test tests/e2e/public-store-landing.spec.js` — 5/5 PASS: desktop choices/QRs, mobile visible fallback, OAuth callback shell, `/register`, and `/profile` landing behavior. The old URL cases fulfill the SPA response in the test; they do not prove the live nginx rewrite.
- `npm run build:web` and static finalizer — PASS with a local placeholder Yandex key. It was not a release build and did not validate production secrets.

### Required routing exceptions, based on repository source (server configuration not inspected)

Do not apply a domain-wide redirect. Preserve:

- `/api/**` and `/security/api/**` API paths.
- `/storage/**` and `/security/storage/**` file paths (legacy signed delivery plus API proxy behavior).
- `/.well-known/assetlinks.json`, `/apple-app-site-association`, and `/.well-known/apple-app-site-association`.
- `/notifications`, `/notifications/**`, `/cargos/**`, `/trips/**`, `/driver/**` for Android App Links/iOS Universal Links.
- `/terms`, `/privacy`, `/support`, `/legal/**`.
- OAuth/email callbacks at `/?social_auth=1`, root `code+state`, access-token and `token_hash` callback shapes; the runtime restores the embedded app shell for recognized callback parameters. Native callback URI `urtruck://auth-social` is not an HTTP route.
- Account deletion is an authenticated API operation (`DELETE` or `POST /api/v1/register/account`), not a website page.

`/register` and `/profile` fall back to the landing only if the server sends them the static `index.html`. This is covered with a mocked SPA fallback, not a live-server check. Production nginx `location` precedence, OAuth/email redirects, legal and deep-link responses, and existing file routing still require read-only server inspection before publication.

### Service worker/cache behavior

`sw-template.js` is v18: HTML/JS navigations are network-first and are cached only after a successful network response; other static assets are cache-first; API is not intercepted. The release postprocessor compares an epoch derived from that template, and on epoch change deletes all Cache Storage entries and unregisters all service workers before reloading. Because the landing uses the same v18 epoch, existing PWA sessions are not force-cleared. A normal online navigation/reload should fetch the new HTML; an already-open tab remains on its current document until navigation/reload; an offline controlled tab may still fall back to an older app shell. No live service-worker or old-tab experiment was run. Do not bump the epoch or globally unregister workers without checking PWA push consequences.

### Separate static-only deployment plan (not executed)

The repo's production workflow is not static-only: it also copies backend code and changes backend runtime state. Do not invoke that workflow for a site-only change. First use the trusted VPS console/SSH to inspect the active nginx `root`, `try_files`, `/api`, `/security`, `/storage`, callback and app-link locations, and confirm the served frontend root. The repository documents `/home/ubuntu/urtruck-app`, but that path and live nginx mapping have not been independently checked in this task.

Once the root and exclusions are confirmed, make a production-keyed store-landing build, stage exactly `dist/**` (the 288 paths and hashes in `dist-sha256.txt`) beside the current static root, verify every staged hash and key routes, then copy/switch only the static tree. Do not touch backend directories, `.env`, storage, database, Nginx, or mobile sessions. Before writing, archive the current static tree. If Nginx serves a symlink, switch that symlink atomically; if it serves a direct directory, use a staged copy and controlled rsync with an explicit file manifest. Rollback is restoration of the archived static tree only; the exact command depends on the confirmed live root/layout. No deployment command has been run.

## Legacy signed file URLs: current code facts

### Issuance paths

- `GET /api/v1/chat/conversations/{conversation_id}/messages` and `GET /api/v1/chat/conversations/{conversation_id}/attachments`, plus the corresponding authenticated attachment upload response: deal-room logic first requires an authenticated user, room membership, and an accepted/open deal, then signs chat file refs.
- Legacy `GET /api/v1/chat/messages/{room_id}` signs message photo/voice refs after authenticated membership and accepted-chat checks.
- `GET /api/v1/users/me` signs the requesting owner's own verification-document fields.
- `POST /api/v1/users/me/pro-documents/{kind}` signs the just-uploaded document for its authenticated owner.
- `GET /admin/data/pending` signs moderation documents for a Basic-Auth admin.
- `GET /api/v1/market/cargos` and `GET /api/v1/market/cargos/{cargo_id}` sign cargo photos for public marketplace display; `GET /api/v1/market/drivers` signs approved vehicle/cabin photos. These are marketplace photos, distinct from private chat attachments.
- Legacy media bytes are also directly served by authenticated `GET /api/v1/chat/messages/{room_id}/media/{message_id}` after checking participant, room, message and accepted-chat relationship; that endpoint itself does not issue a signed URL.

### TTL and revocation

For local HMAC URLs, `file_signing.sign()` defaults to 86,400 seconds (24 hours); pro-document upload explicitly requests 3,600 seconds (1 hour). Expiry is rounded up to the signing window, at most 15 minutes beyond the requested TTL. The `/security/storage/{path}` and `/storage/{path}` handlers check path containment, HMAC and `exp`, then stream the file with `private, no-store`; they do not authenticate an actor or query room/file ACL. Once issued, a local URL remains a bearer capability until `exp` unless its key or object is changed.

For Supabase private refs, `storage_service.create_signed_url()` requests a provider-signed object URL; TTL is clamped to 60 seconds through 7 days. The usual chat/profile default is 24 hours and pro-document upload is 1 hour. The subsequent fetch goes directly to Supabase, so UrTruck cannot re-check room membership on each fetch. Existing provider URLs remain valid until provider expiry unless the provider/object is changed. The app does not record each issued URL or its expiry, so code cannot enumerate which previously issued URLs are still live.

After deal cancellation or room ACL change, newly requested private content through `/api/v1/chat/conversations/{conversation_id}/attachments/{attachment_id}/content` is denied. Earlier signed URLs do not consult that route and are not revoked by the status change. The only directly observed prior-link behavior here is a local isolated-storage regression test (added in this work; awaiting CI): it is expected to return exact bytes after cancellation until `exp`, then 403, while retaining the underlying file. This is not a real QA2 storage result.

### Old clients and transition

Known deployed artifact reports identify Android 1.0.14 / versionCode 215771497 from `ac015acce807dc2ca931beb7df61b203c554156d`, iOS 1.0.14 (127) from `ac015acc`, and TestFlight 1.0.15 (129) from `a2258821b5daff8bfa5ec0f54f14999c00df7338`. The source inspected for these clients opens attachment URLs directly (React Native `Linking.openURL`); they depend on legacy signed URLs for documents. The current PR candidate's web/iOS/Android attachment paths use authenticated `getPrivateFile(roomId,fileId)` for private chat documents, photos and voice, but that candidate has not been released. The exact population of still-installed older versions is unknown.

A safe migration must first inventory the actual QA2 provider, all 133 historical attachment rows and their confirmed room/message/deal associations, plus object existence and SHA-256. Keep each object and DB ID/relationships. Test both participants, guest/outsider, swapped room/file/message IDs, another deal, and cancelled-room rules against actual QA2. Then stop issuing bearer URLs for private chat attachments to updated clients and require the protected content endpoint. Maintain any compatibility path only for explicitly identified old app versions during a bounded rollout. After the last issuance is stopped, wait the maximum provider TTL (up to 7 days) and verify old URLs fail before claiming revocation. Supabase direct URLs cannot be individually revoked by UrTruck's current code; do not rotate shared keys, delete objects, or alter production ACLs without a separate approved migration. If continued old-client issuance prevents the TTL window from closing, the file P1 remains open.

## Test/review/QA2 status

A new isolated local-storage regression test is being added to `backend/tests/test_private_attachment_content.py`: it writes a synthetic PDF to a temporary storage root, checks both participants get the exact SHA through the protected route, cancels the deal, checks the protected route denies access while retaining bytes, then verifies the old signed URL remains a bearer path only until its expiry. Python dependencies (pytest/FastAPI) are not installed in the local interpreter, so only `py_compile` and diff checks are available locally; CI must execute this test before it is treated as PASS.

No reviewer is assigned or requested on PR #705 at this checkpoint. The previously rejected automated security-review action was not retried. A README/package is evidence preparation, not independent review. Current PR head before this test-only commit was `e2f7b168...`; CI for it was green, but it cannot cover this added test.

QA2 storage, its 133 historical objects, real Supabase/provider signed links, actual nginx exclusions, old-client populations, and phone behavior were not checked. QA2 SSH remains blocked until the owner compares the host key fingerprint from the VPS VNC/KVM console with the Ed25519 public-key pin in GitHub Actions secret `SERVER_SSH_KNOWN_HOSTS` (the secret value itself must not be disclosed).
