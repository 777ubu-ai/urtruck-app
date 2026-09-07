# URTRUCK DESIGN SYSTEM 2026

> Статус: **кандидат v1.0 (на утверждение)**. Палитра ниже — стартовая
> профессиональная цель, а не догма: каждое значение должно пройти визуальную
> валидацию и проверку контраста (WCAG AA) на реальных экранах до массовой
> миграции. Новые экраны и правки UI обязаны использовать semantic tokens из
> `src/theme/designSystem2026.js`, а не локальные литералы.

---

## 0. Контекст и принципы

UrTruck — рабочий инструмент перевозок и денег. Визуальный язык: дорого,
спокойно, технологично, международно. Не игровое, не перегруженное.

Главное правило: **сначала система, потом исправления**. Любая UI-правка
после утверждения этого документа — через tokens/components.

Цветовая архитектура: чёрный/графит + фирменный оранжевый, оранжевый
дозированно (brand, главный CTA, selected, ключевые акценты). Большие
поверхности — спокойные нейтральные.

---

## 1. Аудит текущего состояния (факты из кода, main)

### 1.1. Источники темы — 5 параллельных файлов

| Файл | Что внутри | Статус |
|---|---|---|
| `src/theme/theme.js` | v3: emerald `#168759` + orange `#FF8400` | жив (Feed skeleton/glass) |
| `src/theme/brandV2.js` | `useBrand` | жив |
| `src/theme/designSystemV2.ts` | полноценные tokens | **не подключён** |
| `src/theme/designV1.js` | LIGHT/DARK, `useV1Colors`, `v1AccentFor` | жив; **обе роли → один зелёный `#168759`** |
| `src/utils/theme.js` | `truckColors` + `useTheme()`/ThemeContext | жив в ChatsListLegacy (третий источник) |

### 1.2. Конфликт канона ролей (принятое решение)

- `designV1.js` и CLAUDE.md: «обе роли зелёные» (`v1AccentFor` всегда `#168759`).
- Реальность кода: `DealRoom.js` (`DRIVER_ACCENT='#168759'`,
  `CLIENT_ACCENT='#FF8400'`), AppNavigator, MyTrips, Wallet, Profile,
  PushFilter — везде **driver=зелёный, shipper=оранжевый**.
- **Решение (фиксируется):** целевая схема — `role.driver.*` = green family,
  `role.shipper.*` = orange family. Расхождение с designV1 задокументировано,
  массовую перекраску designV1 в этой итерации не делаем.

### 1.3. Хардкоды и типографика-мусор

- `#FF8400` — 29+ вхождений в ~15 файлах (вместо `brand.*`).
- Дробные размеры текста: 15.5, 16.5, 12.5, 11.5, 10.5, 13.7, 17.3, 21.2 —
  в FeedScreen, QueueScreenCarousel, ChatScreen, TrackTruckScreen,
  DealWorkspaceScreenV2 (10.8/11.7/14.5).
- WhatsApp-хардкоды в ChatScreen: bubble `#D9FDD3`/`#111B21`.
- Два чат-экрана: `ChatScreen.js` (legacy, жив для support и deal-чатов)
  и `DealWorkspaceScreenV2.js` (принятые сделки через DealWorkspaceRoute).
  Два voice-бабла: `src/components/chat/VoiceMessageBubble.js` (chat)
  и `src/components/VoiceMessageBubble.js` (DealWorkspaceV2 + тест-контракт).
  **Объединение — отдельная задача, не входит в эту итерацию.**

### 1.4. Таблица Current → Token (выжимка)

| Current | Usage | Keep | Replace | New Token |
|---|---|---|---|---|
| `#FF8400` | акценты shipper/CTA, 15 файлов | нет | да | `brand.primary` / `role.shipper.primary` |
| `#168759` | driver-акцент, статусы | да (как driver) | частично | `role.driver.primary` / `status.success.*` |
| `#D9FDD3` | outgoing bubble (light) | нет | да | `chat.bubbleOutgoing` |
| `#111B21` | outgoing bubble (dark) | нет | да | `chat.bubbleOutgoingDark` |
| `#667085`-подобные серые | secondary text | да | — | `text.secondary` |
| `#E4E7EC`-подобные | borders | да | — | `border.default` |
| 14/19 msgText | текст сообщения | нет | да | `typography.chatBody` (16/21.5) |
| 72% bubble maxWidth | сообщения | нет | да | `chat.bubbleMaxWidth` (0.76) |

---

## 2. COLOR TOKENS

### 2.1. Semantic groups (обязательны к использованию)

```
brand.*        — фирменная идентичность (оранжевый, дозированно)
role.driver.*  — зелёная семья водителя (индикаторы, акценты роли)
role.shipper.* — оранжевая семья грузоотправителя
status.*       — success/warning/danger/info (НЕ путать с role.*)
chat.*         — фон чата, пузыри, composer
surface.*      — background/surface/surfaceSecondary
text.*         — primary/secondary/muted
border.*       — default/strong
```

Правило: смысл элемента никогда не кодируется только цветом — всегда
помогают текст, иконка, форма или label.

### 2.2. Кандидатная палитра (light)

| Token | Value | Примечание |
|---|---|---|
| `surface.background` | `#F7F8FA` | premium neutral |
| `surface.default` | `#FFFFFF` | |
| `surface.secondary` | `#F1F3F5` | |
| `text.primary` | `#17191C` | |
| `text.secondary` | `#667085` | |
| `text.muted` | `#98A2B3` | timestamps, hints |
| `border.default` | `#E4E7EC` | |
| `brand.primary` | `#F97316` | UrTruck orange |
| `brand.soft` | `#FFF3E8` | tint-поверхности |
| `brand.pressed` | TBD | подобрать по WCAG + visual test |
| `role.driver.primary` | `#16A34A` (alt `#22A559`) | профессиональный зелёный |
| `role.driver.soft` | `#EAF7EE` | |
| `role.shipper.primary` | `#F97316` | = brand.primary (роль ≠ второй бренд) |
| `role.shipper.soft` | `#FFF3E8` | |
| `status.danger` | `#D92D20` | |
| `status.warning` | `#F79009` | |
| `status.info` | `#2E6CE6` | |
| `chat.bubbleOutgoing` | `#DCFCE3`-семья | мягкий светло-зелёный, НЕ кислотный; финал — visual test |
| `chat.bubbleIncoming` | `#FFFFFF` | с separation от фона |

Dark-варианты каждого токена — в `designSystem2026.js`, проходят тот же
visual test. WCAG AA: текст ≥4.5:1, крупный текст ≥3:1.

---

## 3. TYPOGRAPHY

Запрещены «мусорные» размеры (13.7, 15.5, 17.3, 21.2 и т.п.) без
доказанной причины. Масштаб (mobile):

| Token | Size/Weight | Применение |
|---|---|---|
| `display` | 28–32 / semibold-bold | редкие hero-экраны |
| `h1` | 24 / semibold | |
| `h2` | 20 / semibold | |
| `h3` | 18 / semibold | |
| `bodyLarge` | 17 / regular | |
| `body` | 16 / regular | **основной текст приложения** |
| `bodySmall` | 14 / regular | |
| `caption` | 12–13 / regular | |
| `timestamp` | 11–12 / regular | время сообщений, метаданные |
| `button` | 15–16 / medium-semibold | |
| `badge` | 11–12 / medium-semibold | |

Если надпись не помещается: 1) исправить layout, 2) увеличить ширину,
3) разрешить корректный wrapping, 4) сократить локализованный label,
5) только потом — небольшой typography adjustment. **Нельзя уменьшать
текст, чтобы он влез.**

### 3.1. ZH-типографика (отдельная проверка)

Китайские символы занимают иную высоту: проверять lineHeight, baseline,
clipping, vertical centering в buttons/tabs/cards/chips/notification text.
Ни один иероглиф не обрезается сверху/снизу. Минимальный body для ZH — 16sp
(иераглифы мельче 14sp нечитаемы в плотных строках).

---

## 4. SPACING

Базовая шкала: **4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48**.
Промежуточные значения — только при системной необходимости.

- Screen horizontal padding: 16
- Compact gap: 8–12
- Normal component gap: 12–16
- Section gap: 24–32
- Card internal padding: 16
- Web/desktop: max-width + responsive grid.

## 5. GRID

Mobile: одна колонка, контент в 16px-инсетах. Web: 12-колоночная сетка,
max-width контентной области ~1200px, боковые отступы ≥24px.

## 6. RADIUS

| Token | Value | Применение |
|---|---|---|
| `radius.sm` | 8 | chips, small controls |
| `radius.md` | 12–14 | buttons, inputs |
| `radius.lg` | 14–16 | cards |
| `radius.pill` | 999 | только там, где pill осознанно нужен |

## 7. BUTTONS

Варианты: Primary / Secondary / Tertiary / Destructive / Icon / Compact /
Full-width.

- Standard mobile height: **48dp**; главный CTA: 52–56dp;
  compact: 40–44dp visual при сохранении touch target ≥44/48.
- Radius 12–14dp. Pill — только осознанно.
- **Кнопка никогда не выходит за рамки**: для RU/ZH/EN тестировать
  smallest phone width, font scaling, длинные русские labels. Запрещены
  clipped text, label поверх иконки, overflow за screen edge, две кнопки,
  физически не помещающиеся рядом. При нехватке места layout адаптируется
  (wrap в колонку / secondary→tertiary).

## 8. INPUTS

- Height 48–52dp, multiline — авто-высота.
- Radius 12–14dp, label 14sp, input text 16sp, error 12–13sp.
- Состояния обязательны: default/focused/filled/disabled/error/success.

## 9. CARDS

Radius 14–16dp, padding 16dp, тонкий neutral border, минимальная тень
(никаких тяжёлых «парящих» карточек). Иерархия: главное → маршрут →
цена/условия → metadata → status → action.

## 10. CHIPS / 15. STATUS CHIPS

Высота 28–32dp, text 12–13sp medium, horizontal padding 10–12dp,
soft background + readable foreground. Без огромных насыщенных плашек.

## 11. BADGES

Счётчик-компакт: высота 18–20dp, text 11sp semibold, min-width = высоте
(круг при 1–2 цифрах, pill при 99+ → «99+»). Цвет — `status.danger` на
нейтральной иконке, без двойных обводок.

## 12. TABS

Высота ≥40dp, label 14sp medium, selected — `brand.primary` underline/pill
(одна система на весь продукт), unselected — `text.secondary`.

## 13. HEADERS (канон)

Все root screens — одна архитектура: **Bell слева, Menu/Hamburger справа**.
Одинаковые размеры иконок (22–24dp внутри 44×44 target), horizontal padding
16dp, top safe-area, badge positioning, baseline заголовка.

## 14. BOTTOM NAVIGATION

- Driver: Грузы / Мои рейсы / Сделки / Профиль
- Shipper: Грузы / Машины / Сделки / Профиль

Icon 22–24dp + label 11–12sp, selected state через `role.*`/brand,
badge компактный, safe-area, высота не прыгает между устройствами,
проверка RU/ZH/EN на переполнение.

## 15–26. CHAT (уровень WhatsApp/WeChat по UX-зрелости, без копирования чужого бренда)

- **Background:** мягкий спокойный светлый фон, покрывает header→composer,
  safe-area, пространство за сообщениями, keyboard transition. Без белых дыр.
- **Message text:** 16sp / lineHeight 21–22; timestamp 11.5–12;
  date separator 12.5; maxWidth пузыря 76–80%. Короткое «Да» не растягивается.
- **Colors:** outgoing — мягкий светло-зелёный (`chat.bubbleOutgoing`),
  текст почти чёрный, timestamp neutral. Incoming — белый нейтральный.
  Статусы sending/sent/delivered/read/failed — различимы, но тихие.
- **Voice:** collapsed height 64–72dp (цель ~68); play/pause 22–24dp
  в target ≥44/48; обязательны waveform/progress, duration, speed, status,
  «В текст». Никаких огромных speaker-иконок.
- **Composer (канон):** `[ + ] [ поле … emoji ] [ микрофон ] [ Send ]`.
  Plus 22–24dp, text 16sp, emoji 20–22dp, mic 22–24dp, send 22–24dp
  или компактная профессиональная кнопка. Одна строка по умолчанию,
  растёт при multiline до max height, далее scrollable.
- **Keyboard:** composer непосредственно над клавиатурой (Android 15/16 + iOS).
  Без overlay, двойного padding, огромных gap, прыжков scroll.
- **Chat header:** компактный. Помещаются back, avatar, имя, маршрут/контекст,
  actions. Длинный маршрут не разрушает header. Избыточные дубли убрать;
  **сырые UUID/id в шапке не показываются** — человеко-читаемый ref или скрыт.
- **Attachments:** plus-меню спокойное, grid единый, иконки одной системы
  (Camera/Photo/Document/Location/Contact/Catalog/Quick reply).

## 27. NOTIFICATIONS

Разделены: ОС-push / in-app notification center / badge-count.
In-app row: min height 64–72dp, icon/avatar 40–44dp, title 15–16sp medium,
body 14sp, timestamp 11–12sp, unread-индикатор компактный, padding 12–16dp.
Push не выглядит огромной карточкой; текст без внутренних технических имён,
локализован, с действием/событием. Иерархия: «Новое предложение —
Алматы → Москва · 5 000 USD».

## 28. LOADING / 24. SKELETON / 25. EMPTY / ERROR STATES

- Loading: индикаторы тихие, не блокирующие контент без причины.
- Skeleton: shimmer поверх `surface.secondary`, форма = форме контента.
- Empty: иллюстрация/иконка + 1 заголовок + 1 действие. Без стен текста.
- Error: `status.danger`-акцент, понятный текст, retry-действие.

## 29. MAP OVERLAYS / MODALS / RESPONSIVE / LOCALES

- Map overlays: контролы 24dp-иконки в ≥44 target, карточки поверх карты —
  `surface.default` + radius.lg, не перекрывают критичные контролы.
- Modals/bottom sheets: peek-height ≥ 50% контента-якоря или раскрыт по
  контенту; заголовок + drag-handle; закрытие свайпом/скrim; safe-area
  respected; контент не обрезается («Сообщения» целиком видны).
- Responsive: phones 360–430dp — основной диапазон; фолд/планшет — двухколоночные
  layout там, где выигрывает (список+деталь).
- Locales RU/ZH/EN: все строки из i18n; проверка переполнения на smallest
  width + font scaling; ZH-lineHeight по п.3.1.

## 30. TOUCH TARGETS (глобально)

Минимум 44×44pt (iOS) / 48×48dp (Android). Визуальная иконка внутри —
20–24dp. Касается: back, bell, menu, bookmark, mic, emoji, plus, send, play,
close, map controls, attachment, status actions. **Иконка маленькая — не
значит, что target маленький.**

## 31. ICONS

Одна визуальная система на весь продукт (без смешения filled/outline/
разных stroke width/библиотек). Размеры: UI 20–24dp, header 22–24dp,
contextual 16–20dp, map/floating 24dp в достаточном target.

## 32. DEAL CARDS

Карточка сделки читается за 1–2 секунды: маршрут → вторая сторона → статус →
груз → цена → дата → «что дальше». Статус не занимает половину карточки,
главный action очевиден. Проверяются обе роли.

## 33. ПРАВИЛО ВНЕДРЕНИЯ

1. Новый код — только через `designSystem2026.js` tokens.
2. Миграция — экран за экраном (канарейка: Chat + MyTrips), без больших бангов.
3. Визуальная регрессия: 8 ключевых экранов × RU/ZH/EN × light/dark —
   baseline-скриншоты до/после (CI, будущая итерация).
4. Хардкоды HEX/fontSize в новых правках — запрещены (code review gate).

---

*Документ составлен по аудиту кода ветки main. Автор изменений: design-аудит
2026-09. Дата: 2026-09-07.*
