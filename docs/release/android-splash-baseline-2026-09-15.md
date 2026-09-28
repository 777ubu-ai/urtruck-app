# URTRUCK Android Splash Baseline

Статус: **APPROVED / CLOSED / PASS**  
Дата физической проверки: 2026-09-15  
Package: `com.urtruck.app.qa2`  
Устройство: Phone C (`WGCA9PSGOFUOWC7D`, Android 14, 1080×2400)

## Канонический baseline

- FIX SHA: `7144d2f60e310bf695be153122edf8aac032ef6c`
- QA2 versionCode: `211040013`
- APK SHA256: `bc3202be7d87958730d78eb15ae295cc4bbc150255f1281be72f358773961687`
- Signing certificate SHA256: `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`
- Установка: `adb install -r`, данные приложения сохранены

## Acceptance

| Проверка | Результат |
| --- | --- |
| Physical cold starts | 5/5 PASS |
| First frame | BRANDED |
| Logo | FULLY VISIBLE |
| Bottom bar | CORRECT |
| Black/white/gray flash | NONE |
| Flicker | NONE |
| AppCompat crash | FIXED |
| Android release build | PASS |
| Lint / `lintVitalRelease` | PASS |
| Splash contract | 3/3 PASS |

## Evidence

Полный набор evidence сохранён в:

`/private/tmp/urtruck-splash-final-evidence-20260915/cold-starts-v3/`

В каждом из `run-1` … `run-5` сохранены `first-frame.png`, `branded-frame.png`, `startup-physical.mp4`, `launch.txt`, `logcat.txt`, `window.txt` и `stop.txt`.

Representative evidence:

- `run-1/first-frame.png` — branded first frame;
- `run-1/startup-physical.mp4` — startup sequence;
- `run-1/logcat.txt` — crash check.

Видео собраны из физических ADB screen frames. Встроенный `screenrecord` на Phone C завершается с SIGSEGV, поэтому его нативный файл не использовался как evidence.

## Freeze policy

Splash baseline считается замороженным. Не изменять splash/theme/system-bar файлы без отдельной причины и новой physical cold-start acceptance. При любом изменении этих файлов повторить полный acceptance минимум 5/5 cold starts.

`SPLASH TRACK: CLOSED / PASS`
