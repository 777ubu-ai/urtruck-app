# Production client compatibility deployment — 14.11.2026

Owner explicitly authorized this bounded production deployment in chat.

Applied source **e1cb79f79085962bb7f1cb29c5439631e6445ddb**, PR713. Five-file backend overlay, not a complete backend release. Applied 2026-11-14 21:05:55 Asia/Almaty.

## Changes
- notifications/attention snapshot enables existing client archive/tab/card indicators.
- Protected photo, voice and document byte routes; exact-room ACL and recheck after storage read.
- Upload receipts bind new files to uploader/room/message; capability metadata and legacy default compatibility retained.
- Website, environment, listing modules, other Python source hashes unchanged. Only production API process restarted.

## Verification
- Full source CI: all applicable checks SUCCESS, run43611660882.
- Local backend1045 PASS +13subtests; frontend839 PASS; source lint/build and dependency audit PASS.
- Fresh SQLite backup435175424bytes, quick_check OK; restored-copy SHA256 matches snapshot. Backup location and checksum in DEPLOYMENT.json.
- All previous IDs preserved:708registration records,282cargos,37trips,107bids,50deals,58rooms,648messages,22attachments. Counts are total records, not active UI counts or distinct humans. This proves ID continuity, not full per-field audit.
- New live routes return401 anonymously instead of404. Existing public health/API and download landing smoke:3PASS;1preview-only test skipped.
- Restored production DB plus actual storage via isolated ASGI app: one document, one photo, one voice; both participants receive identical bytes, outsider and guest denied, revoked deal access denied.20account attention snapshots agree with canonical badge totals. Production data not mutated by this acceptance test.
- Device acceptance is NOT RUN: no real authenticated phone HTTP/file/push receipt proof. No claim of a complete mobile release.

## Rollback / continuation
Code originals, verified database snapshot and operator are retained under the backup path. Restore the four original files and remove only the newly introduced module if rollback is required; restart only urtruck-security-api. Retain additive receipts and do not restore the old database over new user activity.

PR713 remains open: ordinary main merge automatically starts a broader deployment and is not covered by this narrow authorization. Runtime overlay manifest is /home/ubuntu/urtruck/runtime/client-compatibility-overlay.json. Future release must reconcile this overlay, preserve the download landing and include current app/auth/feed fixes.

Current test binaries remain iOS1.0.16(4), Android1.0.16/215771502, sourcef2f2dc. No mobile rebuild, store submission or public rollout was performed. Existing apps can use this server patch. Physical push/badge and file acceptance remains separate.
