# PRE-FLIGHT: текстовый поиск направлений внешней ленты

- Branch: fix/external-feed-text-search-20261021; base/HEAD: 6dfa80bff5cb651008508ac0e60743234594afa3.
- Production SHA: UNKNOWN; production не затрагивается.
- Known-good: физического PASS нового фильтра нет. Xiaomi 214494463: задержки интерфейса при открытии общего LocationPickerModal; Android logcat фиксирует пропуски кадров. Общий picker сейчас вычисляет справочник и рендерит список в ScrollView. Причинный вклад отдельных операций не профилирован.
- Scope: только ExternalFreightFeedScreen, чистая функция externalFreightModel и связанные unit/E2E; заменить общий выбор места прямым вводом без обхода городского справочника.
- Protected: общие LocationPickerModal/geography/worldCities, RootHeader, основные экраны обеих ролей, навигация, backend, данные, GPT/перевод, GPS, магазины.
- Checks: текст Хоргос/Бахты/произвольный город, точные страны RU/KK/ZH/EN, очистка прежней страны, отмена без применения, lint, сборка web, браузерный сценарий. Физический PASS только после отдельной сборки/установки.
- Rollback: отменить отдельный patch commit; миграций и серверных изменений нет.
