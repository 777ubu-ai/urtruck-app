# Build 35 — инструкция для терминала (EAS iOS)

Собираем iPhone-only сборку поверх одобренного build 34.
Все frontend-фиксы уже в ветке `claude/youthful-cerf-barf3` (HEAD = честные тексты «доступ сразу»).

## ШАГ 0. Ветка и свежесть
```bash
cd ~/urtruck-app            # или где лежит проект
git checkout claude/youthful-cerf-barf3
git pull origin claude/youthful-cerf-barf3
git log --oneline -1        # должно быть: fix(i18n): убрать ложные «24–48 часов»
```

## ШАГ 1. Регенерируем нативный iOS из app.json (чистый прогон)
Это запекает в ios/: `supportsTablet:false` → iPhone-only, сплэш `contain`.
```bash
rm -rf ios
npx expo prebuild --platform ios --clean
```

## ШАГ 2. ПРОВЕРКА iPhone-only (обязательно перед сборкой!)
```bash
grep -n "TARGETED_DEVICE_FAMILY" ios/UrTruck.xcodeproj/project.pbxproj
# Оба значения ДОЛЖНЫ быть = 1 (не "1,2"). Если 1,2 — стоп, чинить supportsTablet.
```
Причина: Guideline 4 (build 32 отклонили за iPad). `1` = только iPhone.

## ШАГ 3. Фиксируем регенерированный ios/ в ветку
```bash
git add ios app.json
git commit -m "chore(ios): prebuild build 35 (iPhone-only, сплэш contain, честные тексты)"
git push origin claude/youthful-cerf-barf3
```

## ШАГ 4. Сборка (номер build 35 присвоится автоматически)
```bash
eas build --platform ios --profile production
```
- `autoIncrement:true` в eas.json сам поднимет buildNumber до 35.
- Дождаться ссылки на .ipa (сборка идёт на серверах EAS ~15–25 мин).

## ШАГ 5. Проверка перед отправкой
- В логах/симуляторе убедиться: сплэш-логотип не обрезан (contain), таббар «Рейсы» с бейджем.
- Версия: если build 34 (v1.0.1) уже ВЫПУЩЕН в App Store — для build 35 нужна новая
  маркетинговая версия (1.0.2). Проверить в App Store Connect. Если 1.0.1 ещё «Ready
  for Sale» и мы обновляем — завести новую версию 1.0.2 в ASC и приложить к ней build 35.
  Если 1.0.1 ещё НЕ выпущен (в review/pending) — можно приложить build 35 к той же версии.

## ШАГ 6. Отправка на ревью
Вариант A (через EAS):
```bash
eas submit --platform ios --profile production --latest
```
Вариант B (вручную): в App Store Connect выбрать build 35 у нужной версии → Submit for Review.

## Доступ для ревьюера (для формы App Review)
- Вход выполняется через обычный **Email OTP**.
- Использовать отдельный reviewer mailbox, доступный команде App Review.
- Фиксированных кодов и привилегированного reviewer bypass в production нет.

## Что нового в build 35 (для What's New / заметок ревьюеру)
- Честные тексты проверки документов (доступ открывается сразу).
- Бейдж денежных событий на вкладке «Рейсы».
- Исправлен сплэш-экран (логотип по центру).
- Валидация селфи с правами (лицо в кадре).
- Цена сделки в карточке груза, валюта в уведомлениях.
- Мелкие UI-фиксы (белая полоса снизу и т.д.).
