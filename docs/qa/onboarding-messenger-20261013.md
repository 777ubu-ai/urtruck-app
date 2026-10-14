# Исправление входа и необязательного мессенджера, 13.10.2026

## Preflight
- База PR #520: 89dd791cf6e6be85b93173c6036038f0346a7fb4.
- Ветка: fix/onboarding-optional-messenger-20261013, отдельный worktree.
- Scope: ProfileV2, начальная навигация, PATCH /users/me и связанные тесты.
- Known-good: CI базы успешен; физическая приёмка этой базы отсутствует.
- Защищены: OTP, права backend, изменение телефона, реальные сделки и production.
- Rollback: вернуть предыдущие frontend/backend артефакты QA2. Новых миграций нет.

## Подтверждённая причина
На OPPO через существующий Chrome CDP выполнены только GET /register/me и GET /users/me с текущим токеном внутри браузера. Токен не выводился.
/register/me: 200, role=guest, verification_level=0.
/users/me: 403, detail.error=verification_required, current_level=0, required_level=1.
Журнал QA2 фиксирует повторные PATCH /users/me 403 13.10 с 09:08 до 09:11 UTC.
Гостевая сессия без роли после cold start ранее попадала в RoleV2, а затем ProfileV2. Это не даёт права сохранять профиль.

## Изменения
- Гость уровня 0 без роли начинает с входа, подтверждённый аккаунт без роли — с RoleV2.
- Мессенджер и контакт не блокируют регистрацию ни frontend, ни backend; основной телефон и имя остаются обязательными.
- WhatsApp сохраняет существующий выбор основного телефона; Telegram/WeChat не подменяются телефоном.
- verification_required отображается понятным сообщением в RU/ZH/EN/KK, форма остаётся открытой.
- Проверки смены телефона, приватность counterparty и обязательная машина водителя сохранены.

## Проверки
- Полная frontend-регрессия: 1181 passed, 0 failed.
- Backend profile contract + phone-change security: 24 passed.
- Playwright локальной веб-сборки, API mocked: 12 passed (1440px и 393px), включая optional messenger и guest reload.
- Lint: 497 JS parsed PASS. Web export PASS.
- Graphify AST-only: 10849 nodes, 23865 edges; граф удалён после анализа.
- Четыре старых shape assertions требовали удалённую обязательность мессенджера; обновлены под явное решение владельца, добавлены поведенческие проверки.

## Граница
QA2/production не развёрнуты, на телефонах исправление не установлено. Требуется независимый review навигации/Auth/API и deploy окончательного кандидата QA2, затем реальный вход и сохранение на обоих телефонах. Моки не подтверждают реальную OTP-доставку.
