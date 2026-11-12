# PRE-FLIGHT — публичный информационный сайт UrTruck

Дата: 2026-11-12

- **Branch/SHA:** `fix/owned-publication-expiry-20261111` / исходный HEAD
  `dcaf2e5be9a3d090afbf513c193a5ae0c20e8a10`.
- **Изменения до работы:** tracked-файлы чистые. Существовали неотслеживаемая
  ссылка `node_modules` и checkpoint `qa-evidence/site-store-landing-20261112/CHECKPOINT.md`;
  обе сохранены и не включаются в commit.
- **Known-good:** предыдущий checkpoint PR705 указывает на `e2f7b168…` и CI
  для того SHA. Этот PASS не переносится на новый кандидат.
- **Production observation:** read-only `https://urtruck.kz/build-info.json`
  вернул `d6759c76ca74abc00a09cb210f235f33b55f64c9`, build time
  `2026-10-18T11:23:08Z`, version `127`. `/register` вернул старый HTML,
  HTTP 200, `Last-Modified: 2026-10-18 11:25:46 GMT`. Пользовательское
  наблюдение старой формы с датой рождения и ИИН согласуется с устаревшим
  production web bundle. Production не менялся.
- **Scope:** только новый каталог `public-site/`, его preview/build scripts,
  браузерные проверки и QA evidence. Mobile/Auth, API/backend, storage,
  пользовательские данные, база, PR705 file-security-код и production nginx
  защищены от изменений.
- **Known-good design assets:** app screenshots из
  `docs/appstore/screenshots/iphone-6.7/`; транспортная onboarding-иллюстрация
  из `assets/onboarding/slide-1-hero.jpg`; QR из `web/store/`, адреса QR
  проверяются распознаванием кода.
- **Checks:** отдельная статическая сборка, 4 browser widths/user-agent states,
  4 языка, старые web URL, callback states, API/legal/AASA route behavior,
  service-worker/cache logic, Playwright, lint, build SHA/hashes.
- **Rollback:** production не затрагивался. Откат только кода — `git revert
  <site-commit>` в feature branch. Будущий server rollback — переключение nginx
  static root на сохранённый прежний web-root и `nginx -t` + штатный reload;
  пользовательская база, uploads и backend не затрагиваются.
