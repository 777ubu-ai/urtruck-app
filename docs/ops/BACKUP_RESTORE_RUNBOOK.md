# Backup / Restore Runbook

Release hardening track A (2026-09-10). Written because the codebase had
backup-**creation** tooling (`backend/scheduler/backup_job.py`, hourly;
`.github/workflows/production-backup.yml`, manual full-system) but no
restore procedure at all — this is the first time it's written down.

**Scope of this document**: SQLite database restore is fully scripted and
tested (`backend/scripts/restore_db_snapshot.py` + `backend/tests/
test_restore_db_snapshot.py`). Storage and env/config recovery below are
**checklists**, not scripts — they depend on which storage provider and
which secrets were live at backup time, which this document cannot know in
advance. Follow them by hand, carefully, during an actual incident.

**Golden rule**: every step in this runbook is designed so that a mistake
leaves you with *two* recoverable copies (the untouched backup snapshot,
the untouched live server) rather than zero. If a step doesn't say
"now overwrite production", it doesn't overwrite production.

---

## 1. Where backups live

| What | Where | Frequency | Retention |
|---|---|---|---|
| SQLite snapshot (`security-<UTC ts>.db` + `.sha256`) | `/home/ubuntu/urtruck-security/backups/` on the production server | Hourly (`scheduler/jobs.py`'s `db_backup` job) | Last 48 (2 days) |
| Full system (DB + `.env` files + `storage/` + nginx conf + pm2 dump + code tarballs, with a `SHA256SUMS` manifest) | `~/urtruck-backups/<UTC timestamp>/` on the production server | Manual only — GitHub Actions → "Production Backup" workflow (`workflow_dispatch`) | Last 10 sets |

Both mechanisms already verify what they create (`PRAGMA quick_check` on
the DB snapshot; `SHA256SUMS` for the full-system tarball) — see each
file's own comments for the verification-on-create logic. This runbook is
about what happens **after** that, when you actually need one of them.

---

## 2. Database restore — the scripted, tested path

### 2.1 Always start with a dry-run verify

From the production server (or anywhere with SSH/SCP access to fetch the
snapshot first — verifying off the production box is *safer*, not just
convenient, since it can't touch anything live even by accident):

```bash
cd backend
python3 scripts/restore_db_snapshot.py \
  /home/ubuntu/urtruck-security/backups/security-<UTC-timestamp>.db
```

By default this:
- verifies the `.sha256` sidecar matches the file on disk,
- restores a copy into a **fresh temp path** (never a live one),
- runs `PRAGMA quick_check` against that copy,
- prints row counts for every core table (`drivers_registration`,
  `cargos`, `trips`, `bids`, `deals`, `chat_rooms`, `chat_messages`,
  `notifications`, `push_devices`, `reviews`, …) so you can eyeball
  "does this look like a real, populated backup from roughly the right
  time" before trusting it.
- **Makes zero writes to any live database.** Confirmed by
  `backend/tests/test_restore_db_snapshot.py`.

If this step reports a checksum mismatch or a failed `quick_check`: **do
not use this snapshot.** Try the previous hourly one (or the most recent
full-system backup) and re-run the dry-run against that instead. A failed
verify here means the *backup itself* is bad — restoring it would just
move corruption into production.

### 2.2 Pick which snapshot to restore

- If the incident is "the app is fine, but a specific recent write corrupted
  data" (bad migration, a bug that wrote garbage): find the **most recent
  hourly snapshot from *before* the bad write**. `ls -la` the backups
  directory, sorted by name (timestamps sort lexically).
- If the incident is "the whole server / disk is gone": you need the full
  system backup (see §4), not just the DB snapshot — the DB alone doesn't
  help if `storage/`, `.env`, and the app code are also gone.

### 2.3 Take production down for the swap

**This is the only step in this runbook that touches the live server.**
Do it deliberately, not as a reflex:

```bash
# 1. Stop the API so nothing writes to the DB file while you swap it.
pm2 stop urtruck-security-api

# 2. Snapshot the CURRENT (possibly-bad) live DB before overwriting it —
#    this is your undo button if the restore turns out to be the wrong
#    call after all.
cp /home/ubuntu/urtruck-security/database/security.db \
   /home/ubuntu/urtruck-security/database/security.db.pre-restore-$(date -u +%Y%m%dT%H%M%SZ)

# 3. NOW actually restore, straight onto the live path, with the required
#    explicit confirmation flag:
cd backend
python3 scripts/restore_db_snapshot.py \
  /home/ubuntu/urtruck-security/backups/security-<UTC-timestamp>.db \
  --target /home/ubuntu/urtruck-security/database/security.db \
  --i-understand-this-overwrites-the-target-file

# 4. Restart and verify.
pm2 restart urtruck-security-api
curl -s http://127.0.0.1:8001/health
curl -s http://127.0.0.1:8001/api/v1/system/info
```

### 2.4 Rollback (if the restore was wrong)

The `.pre-restore-<timestamp>` copy from step 2.3.2 is exactly the state
you were in before you started. To undo:

```bash
pm2 stop urtruck-security-api
cp /home/ubuntu/urtruck-security/database/security.db.pre-restore-<timestamp> \
   /home/ubuntu/urtruck-security/database/security.db
pm2 restart urtruck-security-api
```

Do not delete the `.pre-restore-*` file until you're confident the restore
was correct and the incident is fully closed — it costs one DB's worth of
disk, and it is the only thing standing between "made a mistake" and "made
a mistake and lost the recovery point too".

---

## 3. Storage recovery checklist (not scripted — depends on provider)

Check `STORAGE_PROVIDER` in the server's `.env` (see `GET /api/v1/system/info`
for the running value) before doing anything:

- **`local`**: uploads live on the VPS disk itself
  (`STORAGE_LOCAL_ROOT`). If the disk is intact, there is nothing to
  restore beyond the full-system tarball's own copy (see §4). If the disk
  is gone, **local-storage uploads from before the last full-system
  backup are unrecoverable** — this is exactly why `services/env_check.py`
  already flags `STORAGE_PROVIDER=local` as a production issue.
- **`supabase`**: files live in Supabase Storage, outside this server
  entirely — a server-level incident doesn't touch them. Restoring the
  DB (§2) is sufficient; the `photos`/`docs` URLs in the restored rows
  will resolve against Supabase as before, unless the Supabase project
  itself was also affected (a different incident class — see Supabase's
  own dashboard/support for that).
- **`s3`**: same reasoning as Supabase — check the bucket's own
  versioning/backup posture separately if the incident involves S3
  itself, not just this server.

## 4. Env / config recovery checklist

The full-system backup (`~/urtruck-backups/<timestamp>/`, §1) includes a
copy of the server's `.env` files, nginx config, and a `pm2` process dump.
On a full server rebuild:

1. Restore `.env` from the backup tarball onto the new server, at the
   same path the app expects (`backend/.env` relative to `BACKEND_DIR`).
2. **Before restarting the app**, run the boot-time env guard by hand to
   catch anything the restore missed or that needs rotating:
   ```bash
   cd backend
   URTRUCK_ENV=production python3 -c "from services.env_check import enforce_production_env; enforce_production_env()"
   ```
   A clean run prints `[env-check] production env OK`; any problem raises
   and lists exactly what's missing/unsafe — see `backend/.env.example`
   for what each flagged variable means.
3. **If the incident involved any possibility of credential exposure**
   (compromised server, leaked backup, etc.), rotate secrets rather than
   just restoring the old ones verbatim — `FILE_SIGNING_KEY`,
   `URTRUCK_ADMIN_PASS`, `URTRUCK_API_KEY`, `URTRUCK_ADMIN_TOKEN`,
   `QA_AGENT_TOKEN`/`QA_CLEANUP_TOKEN`, `SUPABASE_SERVICE_KEY`,
   `CGR_IIN_SALT`, and any provider API keys (WhatsApp/Mobizon/Twilio/
   Telegram/eGov/FCM/APNs/OpenAI). Restoring a *leaked* secret verbatim
   just re-exposes it.
4. Restore nginx config and reload (`nginx -t && systemctl reload nginx`)
   before pointing traffic at the rebuilt server.
5. Restore the pm2 process dump (`pm2 resurrect` against the backed-up
   dump file) so the process supervisor config matches what was running
   before, rather than hand-recreating it.

---

## 5. Offsite backup — proposal, not implemented

Both backup mechanisms today write **only to the same production server**
they're backing up (§1) — a single server-level failure or compromise can
take out the live data and both backup copies simultaneously. This runbook
does not wire up an offsite destination; that would mean provisioning a
new external service/credential (an S3 bucket, a second server, a managed
backup product), which is a decision for the project owner, not something
to bolt on silently as part of a hardening pass.

**Recommendation for a follow-up track**, once approved: extend
`production-backup.yml` (or a new scheduled workflow) to `rsync`/`aws s3
sync` the `~/urtruck-backups/<timestamp>/` directory to a destination
outside the production server — reusing the SHA256SUMS manifest that
tarball already produces to verify the copy landed intact. The hourly
DB-only snapshots in `scheduler/backup_job.py` could similarly push each
verified snapshot's `.db` + `.sha256` pair offsite right after the
existing `quick_check`, at whatever interval is judged proportionate
(hourly offsite push may be excessive; syncing once a day, or only the
snapshot that a given day's full-system backup already covers, may be
enough — this is a product/cost decision to make explicitly, not default
into).
