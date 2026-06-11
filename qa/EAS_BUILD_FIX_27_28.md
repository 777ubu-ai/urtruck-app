# EAS Build 27 / 28 — диагностика и статус

> **TL;DR:** Build 27 и Build 28 **НЕ упали в EAS**. Оба `status: FINISHED`, успешно собраны как `.ipa` для production-store distribution. Премиса Brief'а §Phase 0 ошибочна. Никакой фикс не нужен.

---

## 1. Findings (eas build:list --platform ios --limit 10)

| Build | Status | Profile | Completed (UTC) | git commit |
| --- | --- | --- | --- | --- |
| **28** | ✅ FINISHED | production | 2026-06-10 17:27:56 | `510bdc3` (Merge PR #102 — Build 26 cut) |
| **27** | ✅ FINISHED | production | 2026-06-10 17:17:46 | `510bdc3` |
| 26 | ✅ FINISHED | production | 2026-06-10 14:06:29 | `510bdc3` |
| 25 | ✅ FINISHED | production | 2026-06-03 17:04:37 | `23f83fa` |
| 13 | ✅ FINISHED | preview | 2026-05-26 08:39:34 | `25212bf` |

Последние **ERRORED** builds — Build 6/7 от 2026-05-11 (старая история, давно решено).

**Build artifacts:**
- Build 28 ipa: `https://expo.dev/artifacts/eas/hYczEkeLGooBWsD8vErfF3qf17k25XhjpLQIZANgkvA.ipa`
- Build 27 ipa: (см. `qa/build-logs/build_27_meta.json`)

Оба собраны из commit `510bdc3` ветки `main` — Merge integration → main — build 26 cut. Fingerprint hash тот же `f0f98b8f4476d8cfa2aa39e314ea80752b8f3bc1` что у Build 26.

## 2. Что могло сбить Шефа

Premise «Build 27 и 28 упали в EAS» **не подтверждается** EAS API. Возможные источники путаницы:

1. **TestFlight submit failure** — `eas build` ≠ `eas submit`. Сборка прошла; submit в App Store Connect мог упасть (например на code review или metadata). Это **отдельный** pipeline.
2. **TestFlight installation на iPhone Шефа** — Build 25 был последний на iPhone (per таблица §2 Brief). Builds 26/27/28 могли быть собраны, но не отправлены / не invitе'нуты в TestFlight.
3. **`eas submit` rate-limit** — Apple ограничивает private API; submit задерживается с error message.
4. **Apple Review reject** — Apple отклонил Build 27/28 за content/metadata, но это уже после успешной сборки.

## 3. Что я НЕ сделал (за пределами полномочий)

- ❌ Не запускал `eas build` (Шеф запускает утром)
- ❌ Не запускал `eas submit` (требует app-specific password)
- ❌ Не лез в App Store Connect (нужны Apple credentials Шефа)
- ❌ Не менял eas.json / app.json / buildNumber

## 4. Что нужно от Шефа утром (per §10 Brief)

1. **Открыть Expo dashboard** → https://expo.dev/accounts/urtruck/projects/urtruck/builds
2. Verify Build 27 / 28 статус (должно быть FINISHED — артефакты есть)
3. Если нужен Build 29 на новый коммит после merge PR #104 → `eas build --profile production --platform ios`
4. Если Build 27/28 нужно засабмитить в TestFlight → `eas submit -p ios --id <BUILD_ID>` (нужны Apple credentials)
5. Если App Store Review отклонил → проверить email от Apple + App Store Connect

## 5. Verification

```bash
# Сейчас (commit fcbd327):
eas build:list --platform ios --limit 5 --non-interactive --json | jq -r '.[] | "\(.appBuildVersion) | \(.status) | \(.completedAt)"'

# Expected output:
# 28 | FINISHED | 2026-06-10T17:27:56.744Z
# 27 | FINISHED | 2026-06-10T17:17:46.245Z
# 26 | FINISHED | 2026-06-10T14:06:29.988Z
```

## 6. Recommended next EAS build (для Build 29 после merge PR #104)

После merge PR #104 + PR #105 в `fix/driver-flow-critical-ux-cleanup`:

```bash
# Шеф запустит утром (не я):
eas build --profile production --platform ios
# → Build 29 с verification onboarding + real upload flow
```

---

**Phase 0 verdict:** ✅ NO FIX NEEDED. Phase 0 closed in **~15 min** (vs. 90 min plan). 75 min budget rolled to Phase 5/6 (deep test phases).

**Source of truth:** `qa/build-logs/build_27_meta.json`, `qa/build-logs/build_28_meta.json`.

