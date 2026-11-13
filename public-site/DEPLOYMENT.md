# План отдельного статического deploy публичного сайта

**Статус:** подготовлено локально; production не переключался. Текущий
production root/nginx-конфигурация в этой задаче не менялись.

## Read-only снимок production (2026-11-12)

- `/build-info.json` сообщает старый сайт: commit
  `d6759c76ca74abc00a09cb210f235f33b55f64c9`, сборка
  `2026-10-18T11:23:08Z`, version 127.
- `/register` и `/?code=fake&state=fake` пока отвечают старым HTML без
  перехода; production landing ещё не опубликован.
- `/privacy`, `/terms` и `/support` отдают `application/octet-stream`, хотя
  отдельная `/legal/terms.html` уже отвечает `text/html`. При переходе сайта
  адресные `/privacy`, `/terms` и `/support` следует отдавать с типом HTML,
  не меняя сами юридические документы.
- `/.well-known/apple-app-site-association` и
  `/.well-known/assetlinks.json` отвечают `application/json`.
- Анонимный GET `/api/v1/driver/expenses/options` проходит к backend и отвечает
  `401 application/json`; маршрут существует, но это не проверка доступа или
  данных вошедшего водителя.
- Production root API-запросов не переведён на HTML preview. Для точного
  соответствия nginx всё равно требуется актуальный `nginx -T` из VNC/KVM.

## Состав артефакта

Сборка `node scripts/build-public-site.mjs <временный-каталог>` формирует
отдельный статический root. В нём только:

- `/index.html`, `/site/styles.css`, `/site/site.js`, `/sw.js`,
  `/build-info.json`;
- `/site/assets/{cargo-feed,trips-screen,deal-screen}.png` — подлинные скриншоты
  приложения;
- `/site/assets/{google-play-qr,app-store-qr}.png`;
- `/terms`, `/terms.html`, `/legal/terms.html`, аналогично `privacy` и `support`;
- `/.well-known/assetlinks.json`, `/.well-known/apple-app-site-association`,
  `/apple-app-site-association`.

Нет Expo bundle, auth code, пользовательских данных или API секретов. Build
identity — полный source SHA в `build-info.json`; файлы сайта и основных картинок
получают SHA-256 в том же manifest.

## Неприкосновенные маршруты nginx

Перед переключением сохранить без изменения существующие location/upstream для:

1. `/api/`, `/security/api/`, `/storage/`, `/security/storage/`;
2. `/api/v1/register/social/verify`, email-кодов и `/api/v1/register/account`
   (в том числе `/account/delete`);
3. `/.well-known/assetlinks.json`, `/.well-known/apple-app-site-association`,
   `/apple-app-site-association`;
4. `/terms`, `/privacy`, `/support`, `/legal/*`;
5. deep links `/notifications/*`, `/cargos/*`, `/trips/*`, `/driver/*`.

Первые четыре группы должны остаться на их текущих upstream/файлах. Старые
web-пути `/register`, `/login`, `/signup`, `/profile`, `/dashboard`, `/my-work`,
`/my-trips`, `/deals`, `/chat` можно перенаправить на `/`. Другие web-пути
должны получать информационный `index.html` как fallback. Deep link associations
остаются прежними: установленное приложение получает ссылку через ОС; браузерный
fallback открывает только информационную страницу. Не перенаправлять весь домен
на магазин или на `/` до проверки точных upstream location.

Корневой Google/Apple web callback `/?social_auth=1` остаётся на публичной
странице: она удаляет OAuth-параметры из адресной строки и показывает заметку,
не обменивает web-токен и не запускает регистрацию. Нативный callback
`urtruck://auth-social` и мобильный auth-код не меняются. Подтверждение email,
восстановление доступа и удаление аккаунта продолжают идти по существующим API /
внешним provider URL; статический сайт не подменяет их обработчик. В коде
приложения Supabase OAuth endpoint расположен на внешнем Supabase origin;
переадресовывать `/auth/v1/` на новый upstream не нужно.

## Nginx-маршрутизация (после read-only проверки текущего server block)

Ниже — только точечные правила для статического root. Сначала сохранить и
оставить текущие `location` API/storage/deep-link associations как есть;
не заменять весь `server {}`:

```nginx
location = /terms   { default_type text/html; try_files /terms.html =404; add_header Cache-Control "no-cache"; }
location = /privacy { default_type text/html; try_files /privacy.html =404; add_header Cache-Control "no-cache"; }
location = /support { default_type text/html; try_files /support.html =404; add_header Cache-Control "no-cache"; }
location = /.well-known/assetlinks.json { default_type application/json; try_files $uri =404; }
location = /.well-known/apple-app-site-association { default_type application/json; try_files $uri =404; }
location = /apple-app-site-association { default_type application/json; try_files $uri =404; }
location = / { try_files /index.html =404; add_header Cache-Control "no-cache"; }
location = /sw.js { try_files $uri =404; add_header Cache-Control "no-cache"; }
location = /site/site.js { try_files $uri =404; add_header Cache-Control "no-cache"; }
location = /site/styles.css { try_files $uri =404; add_header Cache-Control "no-cache"; }
location ~ ^/(register|login|signup|profile|dashboard|my-work|my-trips|deals|chat)(/|$) { return 302 /; }
location ~ ^/(notifications|cargos|trips|driver)(/|$) { try_files $uri /index.html; add_header Cache-Control "no-cache"; }
location / { try_files $uri $uri/ /index.html; }
```

Перед проверкой должны уже существовать (не создавать этим snippet) действующие
точные/префиксные API и storage proxy locations. Иначе остановиться и
сопоставить `nginx -T` с `routing-contract.json`; нельзя публиковать fallback
без рабочих API исключений. `nginx -t` выполняется после точечной правки на
целевом сервере; локальная Playwright-подмена этим не считается.

## Пошаговое переключение (только после отдельного разрешения владельца)

1. По доверенной консоли сервера сохранить `sudo nginx -T` вне web-root и
   определить активный server block, старый `root`, его owner/mode, upstream
   location и внешний/PWA cache слой. До этого неизвестные имена upstream и
   путь к web-root не угадывать.
2. Выполнить `nginx -T` и `nginx -t`; записать текущий production
   `build-info.json`, список файлов и SHA256.
3. На том же хосте создать backup вне document root, например
   `/var/backups/urtruck-public-site-<UTC>/`. Сохранить старый web-root вместе
   с правами/симлинками и `nginx -T`; проверить archive listing и контрольные
   суммы. Базу, uploads, `.env`, API и backend не копировать и не менять.
4. Скопировать артефакт в новый release directory рядом с текущим root; сверить
   `build-info.json` и manifest SHA. Не перезаписывать старый каталог.
5. В отдельном точечном nginx change заменить только static `root`/`try_files`
   в публичном server block. Существующие API/storage/callback, legal и AASA
   location оставить дословно. Проверить `/`, старые auth/profile URL, все
   service exceptions и deep links на staging/предпросмотре.
6. `sudo nginx -t`; если успешно, reload nginx штатной командой сервера.
   Короткий read-only smoke: `/`, `/build-info.json`, магазины, legal,
   `/.well-known/*`, API health и callback URL. Проверить, что web-страница не
   содержит Expo `#root`, role/profile screens или форму.

## Откат

Новый release каталог оставить на месте. Вернуть только сохранённое значение
`root` (старый путь из шага 1) в том же server block, выполнить `sudo nginx -t`
и штатный reload. Если nginx-конфиг был создан отдельным include/symlink — вернуть
его backup и проверить checksum. Файлы старого root не перезаписываются при
прямом переходе, поэтому восстановление дерева не требуется. Не откатывать базу,
uploads, API или мобильные данные.

## Текущий внешний блокер для точной копипаст-команды

В локальном репозитории нет подтверждённого результата текущего `nginx -T` и
document root production. Владелец сообщил live SHA `d6759c76…` (2026-10-18),
но он не задаёт расположение web-root/upstream. Поэтому локальный артефакт
готов к отдельной публикации; фактическое переключение и полная копипаст-команда
с серверным путём ожидают read-only сверку VPS. Production не изменён.
