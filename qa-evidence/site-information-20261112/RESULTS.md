# Результаты локальной проверки публичного сайта UrTruck

Статус: **локальный кандидат подготовлен; production не переключён**.

## Изменение

Собран отдельный статический информационный сайт. На нём нет Expo web bundle,
экранов входа, выбора роли, регистрации, профиля, объявлений, сделок или чата.
Поля ИИН и даты рождения отсутствуют. Нет кнопок «Войти»/«Зарегистрироваться»
и нет автоматического перехода в магазин. Обе официальные ссылки остаются
видимыми; для Android/iPhone нужная карточка визуально подсвечивается.

Есть RU/KK/EN/ZH, описание двух ролей, рабочая последовательность, подлинные
скриншоты приложения, транспортная иллюстрация, Google Play/App Store QR,
контакт поддержки, ссылки на условия и политику, запрос удаления аккаунта через
существующий support email. Выдуманных показателей, отзывов или партнёров нет.

## Live состояние на момент проверки

Read-only запрос `GET https://urtruck.kz/build-info.json` ответил:

```json
{"commit":"d6759c76ca74abc00a09cb210f235f33b55f64c9","built_at":"2026-10-18T11:23:08Z","version":127}
```

`GET /register` вернул старый web bundle со статусом 200 и Last-Modified 18 октября.
Это подтверждает, что подготовка PR705 ещё не опубликована. Новая информация и
убранные поля в live пока не видны. Публикация запрещена текущим решением до
отдельного разрешения владельца.

## Проверки

| Проверка | Результат |
|---|---|
| Статический build отдельного каталога | PASS; без Expo bundle/секретов, `build-info.json` содержит source SHA и SHA-256 файлов |
| Playwright desktop 1440×1000 | PASS; QR, скриншоты, контакты, оба магазина |
| Playwright mobile 390×844, Android и iPhone UA | PASS; соответствующая карточка магазина выделена, обе ссылки видимы, URL не меняется автоматически |
| Узкий экран 320 px / tablet 768 px | PASS; горизонтального переполнения нет |
| RU / KK / EN / ZH | PASS для ключевых блоков, действий и поддержки |
| Публичная форма | PASS; `form`, `input`, `#root`, Role/Profile/Auth testID отсутствуют; тексты ИИН и даты рождения отсутствуют |
| OAuth callback mock | PASS; обычный, поддельный, отменённый и успешный URL остаются на информационной странице; параметры callback очищаются; email recovery query не перехватывается |
| Старые web URL | PASS локально: `/register`, `/login`, `/profile`, `/chat` и другие ведут на `/` |
| API route preview | PASS как маршрутный контракт: preview возвращает явный 501 sentinel, не имитируя backend; production `/api` upstream не проверен/не менялся |
| Legal/App Links | PASS в preview; terms/privacy/support и исходные Android/iOS association-файлы доступны |
| Service worker | PASS: локальный активный worker, reload сохраняет localStorage sentinel; unit проверка activation удаляет только старые UrTruck shell caches, сохраняет unrelated cache и handlers push/click |
| Магазинные адреса и QR | PASS: Google Play и App Store отвечают HTTP 200; QR Vision распознаёт точно те же URL |
| `npm run lint` | PASS: 670 активных JavaScript-файлов |
| Public-site Playwright | PASS: 6/6 |
| Service-worker unit | PASS |
| JS syntax / `git diff --check` | PASS |
| Реальный OAuth/provider, реальная API, физические телефоны | NOT RUN |
| `nginx -t`, серверный backup и deploy | NOT RUN: доступ к текущей конфигурации/VPS не запрашивался; production не менялся |

Playwright — браузерная эмуляция размеров и user-agent, не тест на телефонах.
Mock callback и локальный API sentinel не подтверждают работу реальных внешних
сервисов.

## Скриншоты

- `desktop-1440.png` — desktop 1440×1000, полный экран;
- `tablet-768x1024.png` — tablet 768×1024;
- `android-390x844.png` — mobile viewport и Android user-agent;
- `iphone-390x844.png` — mobile viewport и iPhone user-agent.

## Отдельный deploy

Статический артефакт формируется командой `node scripts/build-public-site.mjs
<новый-каталог-вне-репозитория>`. Точный состав и маршрутные исключения описаны
в `public-site/DEPLOYMENT.md` и `public-site/routing-contract.json`.

Rollback использует прежний static root и точечное восстановление nginx root;
API, backend, база, uploads и пользовательские данные не трогаются. Активный
production `nginx -T` и document root неизвестны, поэтому путь к server backup,
`nginx -t` и копипаст-команда для переключения требуют read-only сверки VPS.
