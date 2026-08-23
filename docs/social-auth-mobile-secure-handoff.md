# Social Auth Mobile Secure Handoff

Этот документ описывает production-safe handoff для Google + Apple social auth,
когда владелец вводит credentials только напрямую в GitHub Secrets с iPhone, а
JWT для Apple генерируется внутри GitHub Actions.

## GitHub Secrets

Нужны только эти secrets:

- `SUPABASE_ACCESS_TOKEN`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_SERVICES_ID`
- `APPLE_PRIVATE_KEY_P8`

`APPLE_CLIENT_SECRET` вручную создавать не нужно. Workflow
`Configure Google and Apple Auth` генерирует его runtime-only в памяти раннера.

## Как работает Apple часть

Workflow:

1. валидирует, что все обязательные secrets заданы;
2. ставит pinned зависимости `PyJWT==2.10.1` и `cryptography==45.0.6`;
3. создаёт временный `.p8` через `mktemp`;
4. выставляет `chmod 600`;
5. генерирует Apple client secret JWT с `alg=ES256`;
6. маскирует JWT до любого дальнейшего использования;
7. конфигурирует Supabase через Management API;
8. удаляет временный `.p8` и временный JWT-файл даже при fail-path.

## Apple Client Secret Expiry

Workflow выпускает Apple client secret со сроком жизни `180` дней от даты запуска.

Это не бессрочная схема. До истечения срока действия нужно:

1. повторно запустить `Configure Google and Apple Auth`;
2. иметь действительные `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_SERVICES_ID`,
   `APPLE_PRIVATE_KEY_P8`;
3. убедиться, что новый JWT выпущен и Supabase переконфигурирован до expiry.

Если `APPLE_PRIVATE_KEY_P8` удалить сразу после первой настройки, без другого
безопасного источника ключа последующая rotation станет невозможна.

## Rotation Procedure

Если Apple Sign in key меняется или текущий ключ считается compromised:

1. создать новый Apple Sign in key;
2. обновить в GitHub Secrets:
   `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY_P8`;
3. оставить `APPLE_TEAM_ID` и `APPLE_SERVICES_ID` согласованными с production;
4. запустить workflow `Configure Google and Apple Auth`;
5. убедиться, что workflow завершился успешно и `external.apple=true`;
6. только после этого revoke старый key в Apple Developer.

## Redirect Contract

Workflow обязан сохранять существующий redirect allow-list и гарантировать
наличие минимум этих redirect values:

- `https://urtruck.kz/?social_auth=1`
- `urtruck://auth-social`

## Post-Run Cleanup

После успешного production configure можно удалить из GitHub Secrets:

- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY_P8`

Но только если существует другой безопасный источник для следующей rotation.

`APPLE_SERVICES_ID` можно оставить.
