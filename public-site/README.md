# UrTruck — публичный информационный сайт

Отдельный статический сайт; он не импортирует Expo web bundle, AuthContext,
регистрацию, чат или API-клиент приложения.

## Локальный preview

```sh
node scripts/build-public-site.mjs /tmp/urtruck-public-site-preview
node public-site/preview-server.mjs /tmp/urtruck-public-site-preview
```

Откройте `http://127.0.0.1:4178`. Preview обслуживает старые web-экраны
информационной страницей, а юридические и app/universal-link документы — из
проверенных файлов проекта. API и storage в preview не проксируются.

## Сборка

```sh
node scripts/build-public-site.mjs /tmp/urtruck-public-site-release
```

Команда копирует только `public-site/`, три официальных скриншота,
проверенные QR, неизменённые legal-страницы и файлы
Android App Links / iOS Universal Links. Она пишет `build-info.json` с SHA
исходника. Артефакт не содержит Expo bundle, API credentials или пользовательских
данных.

## Изображения

- `assets/cargo-feed.png`, `assets/trips-screen.png`, `assets/deal-screen.png` —
  реальные экраны из `docs/appstore/screenshots/iphone-6.7/`.
- Основная визуальная область оформлена стилями сайта; не используется
  сгенерированный экран приложения. В карусели показаны реальные скриншоты
  из материалов приложения, а не как подтверждение показателей или партнёрств.
- QR-коды ведут на официальные страницы магазинов и сохранены из
  `web/store/`.

## Маршруты

`routing-contract.json` фиксирует маршруты, которые nginx должен продолжить
передавать существующим API/storage и отдавать для legal / app links. Публичная
callback-страница никогда не загружает старый Expo shell. Для реального
переключения сначала нужен read-only `nginx -T`, подтверждённый document root и
резервная копия web-каталога; backend, API, storage, базы и `.env` не меняются.

Подробный порядок и откат: `DEPLOYMENT.md`.
