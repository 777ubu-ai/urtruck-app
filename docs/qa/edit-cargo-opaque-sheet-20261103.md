# Исправление прозрачной формы редактирования груза

Branch: fix/edit-cargo-opaque-sheet-20261103, base a9353ef9490b5e95d6e92c75bbff0738aff29f36. Production SHA UNKNOWN. Known-good physical modal unavailable. Scope: EditCargoModal theme background and regression; backend, navigation, data protected. Checks: palette matrix and existing keyboard contracts; native QA pending. Rollback: revert patch; no data changes.

Причина: EditCargoModal выбирает shipper ceramic palette, но фон sheet читает отсутствующие cardElevated/card. При undefined native View остаётся прозрачным. Добавлен fallback surface без изменения driver cardElevated. Для кнопки сохранения добавлен surfaceAlt/surface fallback legacy theme.

Проверки: node --test tests/frontend/test_edit_cargo_surface.mjs tests/frontend/test_edit_cargo_price_keyboard.mjs — 8 PASS, 0 FAIL. Проверки выражений стилей с фактическими палитрами; это не native rendering или screenshot acceptance. Полные lint/build/CI и устройства NOT RUN. На исходном коде новая матрица выявляет отсутствующие фоны. Обязательная физическая проверка: открыть Изменить из Мои грузы, прокрутить кузова/оплату до Сохранить с клавиатурой и без; фон непрозрачный, основная страница не просвечивает, safe-area и шрифт 1.3; обе темы Android/iOS.

Production, сервер, данные, навигация и логика сохранения не менялись. Новые сборки не запускались.
