# UrTruck — DESIGN SYSTEM 2026

**Ветка:** `fix/urtruck-design-system-2026`
**База аудита:** `integration/final-forward-gps-composer-20260907` (HEAD `3aee1de`, baseline QA `c297e76`)
**Дата аудита:** 2026-09-08
**Статус:** v1.0 — зафиксировано по результатам аудита кода; вступает в силу после утверждения. Все последующие UI/UX-исправления в этой ветке обязаны использовать semantic tokens из этого документа, а не локальные значения.

---

## 0. Результат аудита текущего кода (снимок)

### 0.1. Найденные источники дизайн-токенов (5 конкурирующих систем)

| Файл | Назначение | Проблема |
|---|---|---|
| `src/theme/theme.js` | «Design System v3», colors/tokens/radius/spacing/typography | Своя палитра и шкалы, частично дублирует остальные |
| `src/theme/designSystemV2.ts` | Phase-1 tokens, «не wired into components» | Мёртвый/полумёртвый код, своя типографика |
| `src/theme/designV1.js` | LIGHT/DARK палитры, `useV1Colors()` | Основной runtime-источник для 34+ экранов, но без полных semantic-групп |
| `src/theme/brandV2.js` | Токены онбординга/auth | Дублирует значения V1/V3 под другими именами |
| `src/utils/theme.js` + `ThemeContext.js` | darkTheme/lightTheme для ThemeContext | Третья копия light/dark палитры |

**Вывод:** в проекте параллельно живут ≥4 палитры и ≥3 типографические шкалы. Главная задача системы — консолидация в один модуль `src/theme/tokens2026.*` с semantic-именами и постепенная миграция (без big-bang, экран за экраном, в этой ветке).

### 0.2. Численный аудит

- **205 уникальных HEX-значений** в `src/` + `web/` (нормализованные). Целевое ядро палитры — ≤ 40 токенов.
- **fontSize:** 40 различных значений, включая дробные `8.5 / 9.5 / 10.5 / 11.5 / 12.5 / 13.5 / 14.5 / 15.5 / 16.5` (11.5 встречается 33 раза, 12.5 — 27, 10.5 — 18). Пиковые значения 48–64 используются единично (hero/ценники).
- **borderRadius:** 24 различных значения (0–44 + 999). Наиболее частые: 12 (96), 14 (84), 10 (71), 16 (53).
- **spacing (padding/margin/gap):** топ — 8, 10, 6, 12, 16, 14, 4; хвост случайных 3 / 5 / 7 / 9 / 11 / 13 / 15 / 17 / 22 / 26 / 65.
- **Иконки:** 76 импортов `Feather` (канон, outline) + 2 `MaterialCommunityIcons` + 1 `FontAwesome` (в `BottomNav` — смешение систем, подлежит устранению).
- **hitSlop:** встречается лишь в ~10 файлах на весь `src/` — большинство иконочных кнопок не имеют гарантированного touch target.
- **allowFontScaling / maxFontSizeMultiplier:** не заданы нигде — Android font scaling не контролируется.
- **Роли:** в коде `ROLE_ACCENT` для driver и client **одинаковые** (оба зелёные `#168759`); `cargoOwner` в `designV1.js` также замаплен на зелёный. ТЗ 2026 требует Shipper = orange family → расхождение, фиксируется в §3.

---

## 1. Color Tokens

### 1.1. Инвентаризация текущих цветов (сокращённая таблица)

| Current | Usage (частота) | Keep | Replace → New Token |
|---|---|---|---|
| `#168759` | brand/driver/success, везде (289) | ✅ | `role.driver.main`, `brand.primary` |
| `#0F6B47` | pressed/deep зелёный (17) | ✅ | `role.driver.pressed` |
| `#E8F6EF` | soft green tint (16) | ✅ | `role.driver.soft` |
| `#FF8400` | orange accent/logo/warning (42) | ✅ (значение) | `brand.accent`, `role.shipper.main` |
| `#E06D00` | orange pressed/warning text (23) | ✅ | `role.shipper.pressed` |
| `#F6F8F7` | background light (8) | ✅ | `surface.app` |
| `#FFFFFF` | surface (87+) | ✅ | `surface.card` |
| `#F0F4F2` | secondary surface (6) | ✅ | `surface.muted` |
| `#14221C` | primary text (14) | ✅ | `text.primary` |
| `#617067` | secondary text (18) | ✅ | `text.secondary` |
| `#9AA8A0` / `#9EAAA2` | muted/placeholder (5) | ✅ | `text.muted` |
| `#E5ECE8` | border (13) | ✅ | `border.default` |
| `#C8D8CF` | border strong (5) | ✅ | `border.strong` |
| `#EF4444` | error/danger (77) | ⚠️ заменить на `#DC2626` family | `status.danger.main` |
| `#D64545` / `#DC2626` / `#B42318` / `#B91C1C` | параллельные красные (42 сумм.) | ❌ консолидировать | `status.danger.*` |
| `#D97706` | amber warning (28) | ✅ | `status.warning.main` |
| `#B7791F` / `#CA8A04` | warning variants | ❌ | `status.warning.*` |
| `#3478D4` / `#3B82F6` / `#2878D6` / `#2563EB` / `#378ADD` / `#5BA3F5` | 6 параллельных синих (info) | ❌ консолидировать в `#2E6CE6` | `status.info.*` |
| `#D9FDD3` | WhatsApp-зелёный outgoing bubble (ChatScreen) | ⚠️ | `chat.bubble.outgoing` (см. §17) |
| `#111B21` | тёмный chat bg | ⚠️ | `surface.app.dark` |
| `#0C0A09` / `#0A0A0A` / `#000` | случайные «чёрные» | ❌ | `text.primary` / `surface.*.dark` |
| `#94A3B8` / `#667781` / `#6B7280` / `#475569` / `#334155` | slate-хвост из старых тем | ❌ | `text.secondary` / `text.muted` |
| `#07C160` / `#00C766` / `#22C55E` / `#16A34A` / `#1DBB72` / `#10B981` | 6 параллельных «других» зелёных | ❌ | `role.driver.*` / `status.success.*` |
| `#8B5CF6` / `#6366F1` / `#4F46E5` / `#EC4899` / `#DB2777` / `#84CC16` / `#65A30D` / `#0891B2` / `#06B6D4` | разовые фиолетовые/розовые/лайм/циан | ❌ удалить | — (вне палитры) |
| `#0088CC` | telegram-синий | ⚠️ только brand-ссылки Telegram | `brand.telegram` |
| `#FF9A3D` / `#EA8A00` / `#EA580C` / `#B76B00` | orange variants | ❌ | `role.shipper.*` |

Полная машинная инвентаризация (205 значений с частотами и файлами) — артефакт аудита `qa/design-2026/color-inventory.txt` (генерируется скриптом на этапе миграции).

### 1.2. Финальная палитра (semantic tokens)

Палитра сохраняет фирменную пару **графит + UrTruck orange** и существующий профессиональный зелёный `#168759` (он уже проходит WCAG AA ~4.5:1 с белым текстом — проверено в коде комментарием designV1 и подтверждено расчётом), но **разводит role и status** по отдельным группам (см. §4 ТЗ).

```
brand.primary        #168759   // UrTruck green (CTA, selected, brand marks)
brand.primaryPressed #0F6B47
brand.primarySoft    #E8F6EF
brand.accent         #FF8400   // UrTruck orange — дозированно!
brand.accentPressed  #E06D00
brand.accentSoft     #FFF3E8
brand.telegram       #0088CC   // только внешние Telegram-ссылки

role.driver.main     #168759
role.driver.pressed  #0F6B47
role.driver.soft     #E8F6EF
role.driver.onAccent #FFFFFF

role.shipper.main    #F97316   // shipper orange (обновлённый кандидат 2026)
role.shipper.pressed #C2410C
role.shipper.soft    #FFF3E8
role.shipper.onAccent#FFFFFF

status.success.main  #16A34A   // статус ≠ роль: success отделён от driver green
status.success.soft  #EAF7EE
status.warning.main  #D97706
status.warning.soft  #FEF3E2
status.danger.main   #DC2626
status.danger.pressed#B91C1C
status.danger.soft   #FDECEC
status.info.main     #2E6CE6
status.info.soft     #EAF1FD
status.neutral.main  #617067
status.neutral.soft  #F0F4F2

surface.app          #F7F8FA
surface.card         #FFFFFF
surface.muted        #F1F3F5
surface.lift         #F3FBF7   // hover/pressed карточек
surface.overlay      rgba(16,24,20,0.48)

text.primary         #17191C
text.secondary       #667085
text.muted           #98A2B3
text.inverse         #FFFFFF
text.onAccent        #FFFFFF

border.default       #E4E7EC
border.strong        #C8D8CF
border.focus         #168759
```

**Миграционное замечание:** текущие `#F6F8F7 / #14221C / #617067 / #E5ECE8` визуально эквивалентны целевым `#F7F8FA / #17191C / #667085 / #E4E7EC` (ΔE < 1.5). Чтобы не ломать скриншот-тесты, **на этапе миграции допускается** оставить существующие значения как алиасы новых токенов; визуальная сверка — после утверждения палитры.

### 1.3. Dark theme

```
surface.app.dark     #0F1512   // существующий, подтверждён
surface.card.dark    #151E19
surface.muted.dark   #1B2620
border.default.dark  #2A3930
border.strong.dark   #3A4B40
text.primary.dark    #F3F7F4
text.secondary.dark  #B7C3BB
text.muted.dark      #9EAAA2
role.driver.main.dark    #2BAE72  // green повышенной светлости для тёмного фона
role.shipper.main.dark   #FB923C
status.danger.main.dark  #F87171
status.warning.main.dark #F5B75B
status.info.main.dark    #6EA8FF
```

---

## 2. Typography

### 2.1. Проблема аудита
40 размеров, ~140 дробных значений (10.5/11.5/12.5/13.5/14.5…). Дробные размеры **запрещаются**, кроме задокументированных chat-значений (см. §17, где 11.5 timestamp и 12.5 separator — канон, переносится в tokens).

### 2.2. Шкала (tokens, sp)

| Token | Size / LineHeight | Weight | Применение |
|---|---|---|---|
| `display` | 30 / 36 | 700 | редкие hero-экраны (онбординг) |
| `h1` | 24 / 30 | 700 | заголовки root-экранов |
| `h2` | 20 / 26 | 600 | секции |
| `h3` | 18 / 24 | 600 | карточки-заголовки |
| `bodyLarge` | 17 / 24 | 400–500 | цена, ключевые данные сделки |
| `body` | 16 / 22 | 400 | основной текст, сообщения чата |
| `bodySmall` | 14 / 20 | 400–500 | вторичный текст, labels инпутов |
| `caption` | 12.5 / 16 | 500 | мета, date separator |
| `timestamp` | 11.5 / 14 | 500 | время в чате, push |
| `button` | 16 / 20 | 600 | primary/secondary кнопки |
| `buttonCompact` | 14 / 18 | 600 | compact actions |
| `badge` | 11.5 / 14 | 600 | счётчики, chips |

### 2.3. Правила
- Текст **никогда не уменьшается**, чтобы «влезть». Порядок: fix layout → больше ширины → wrapping → лингвистически корректное сокращение label → и только потом типографика.
- `allowFontScaling` не отключается глобально (доступность); для badge/tab-label задаётся `maxFontSizeMultiplier: 1.15`, для заголовков — `1.3`.
- Числовые данные (цены, км, кг) — `fontVariant: ['tabular-nums']`.

---

## 3. RU/ZH/EN типографика и layout

- **ZH:** lineHeight для CJK увеличивается на +2 к каждому token'у (наследование через `lineHeightZh`). Проверяются: clipping сверху/снизу, baseline, вертикальное центрирование в кнопках/табах/chips/уведомлениях. Ни один иероглиф не обрезается.
- **RU:** самая длинная лексика — все кнопки/статусы тестируются RU-first («Предложить», «Начать рейс», «Завершить»).
- **EN:** контроль mixed-case ширины в tabs.
- Локализованные строки не обрезаются `numberOfLines={1}` без `ellipsizeMode` + layout-фолбэка; критичные action-кнопки — минимум 2 строки или адаптивный layout (§12 ТЗ).

---

## 4. Spacing

Единая шкала (dp/pt): **`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48`**.

| Token | Value | Применение |
|---|---|---|
| `space.1` | 4 | микро-отступы, icon↔label |
| `space.2` | 8 | compact gaps |
| `space.3` | 12 | component gap (compact) |
| `space.4` | 16 | screen horizontal padding, card padding |
| `space.5` | 20 | крупные внутренние отступы |
| `space.6` | 24 | section gap (min) |
| `space.8` | 32 | section gap (max) |
| `space.10` | 40 | разделение крупных блоков |
| `space.12` | 48 | hero-отступы |

Текущие случайные `3 / 5 / 6 / 7 / 9 / 10 / 11 / 13 / 14 / 15 / 17 / 18 / 22 / 26 / 65` мигрируют к ближайшему токену (10→8 или 12 по визуальной сверке; 14→12 или 16; 18→16 или 20).

**Канон:** screen horizontal padding = 16; card internal = 16; component gap = 12–16; section gap = 24–32. Web/desktop — `maxWidth 440` (текущий AppShell) для app-shell и responsive grid для dashboard-страниц.

---

## 5. Grid

- Mobile: одноколоночный поток, горизонтальный padding 16, карточки на всю ширину контента.
- Web: app-shell max-width 440 (сохраняется); админские/дашборд-страницы — 12-col grid, max-width 1120, gutter 24.
- Breakpoints: `<360` compact (smallest supported), `360–767` base, `768–1023` tablet, `≥1024` desktop.

---

## 6. Radius

| Token | Value | Применение |
|---|---|---|
| `radius.sm` | 8 | мелкие элементы, badges |
| `radius.md` | 12 | inputs, маленькие кнопки |
| `radius.lg` | 14 | стандартные кнопки |
| `radius.card` | 16 | карточки |
| `radius.sheet` | 20 | bottom sheets, модали (top corners) |
| `radius.bubble` | 18 | chat bubbles |
| `radius.pill` | 999 | только там, где pill семантичен (chips, переключатели) |

Хвост 2/3/4/5/6/9/10/11/13/15/17/18/21/22/26/27/28/30/40/43/44 мигрирует к шкале.

---

## 7. Buttons

Варианты: `Primary / Secondary / Tertiary(ghost) / Destructive / Icon / Compact / Full-width`.

| Параметр | Standard | Main CTA | Compact |
|---|---|---|---|
| Height (min) | 48 | 52–56 | 40–44 visual |
| Touch target | ≥48 | ≥52 | ≥44/48 через hitSlop |
| Radius | 14 | 14 | 12 |
| Padding H | 20 | 24 | 12–16 |
| Font | `button` 16/600 | `button` 16/600 | `buttonCompact` 14/600 |

- Primary: `brand.primary` bg + `text.inverse` (по роли контекста может быть `role.shipper.main`).
- Destructive: `status.danger.main`; secondary-destructive — `status.danger.soft` + danger text.
- Disabled: `opacity 0.5` (сохранить текущее поведение) + `text.muted`.
- **Кнопка никогда не выходит за рамки** (§12 ТЗ): проверочный набор — Сделки/Предложения/В работе/Архив/Принять/Отклонить/Предложить/Начать рейс/Граница/Доставлен/Получен/Завершить × RU/ZH/EN × smallest width × Android font scaling. При нехватке места — layout адаптируется (stack, wrap, 2 строки), а не обрезка.
- Существующие `ui/PrimaryButton`, `ui/actions/*`, `ui/v1/PrimaryButton` консолидируются в один `Button2026` с variant API.

---

## 8. Inputs

- Height: 48–52 (стандарт), multiline — авто-высота с maxHeight.
- Radius 12–14; border `border.default`, focus — `border.focus` + 2dp.
- Label 14sp, input text 16sp, error 12.5sp.
- Состояния: default / focused / filled / disabled / error / success.
- Placeholder — `text.muted`.
- Консолидируются `ui/v1/Field`, `Textarea`, `CityInput`, `CargoTypeInput`.

---

## 9. Cards

- Radius 16, padding 16, border 1dp `border.default`, shadow минимальная (elevation ≤ 1 / `shadowLight`).
- Никаких тяжёлых «парящих» карточек подряд; визуальное разделение — border + spacing.
- Иерархия контента карточки: главное → маршрут → цена/условия → metadata → status → action.
- Консолидация: `SectionCard`, `v1/FeedCard`, `GlassCard` (glass-эффект — только для map overlays, §20).

---

## 10. Chips / Status Chips

- Height 28–32; text 12.5–13 / 500; padding H 10–12; radius pill.
- Стиль: **soft background + readable foreground** (`status.*.soft` + `status.*.main` text), никаких насыщенных плашек.
- Статус всегда = текст + (иконка при необходимости), никогда только цвет (§4 ТЗ).
- `FilterChips`, `RoleTabs`, `VerificationStatusChip` — к единому `Chip2026`.

---

## 11. Badges

- Count badge: height 18–20, min-width 18–20 (круг при 1 символе), text 11.5/600, radius pill.
- Позиционирование: top-right от иконки, overlap 25%, с обводкой 2dp цвета поверхности.
- Цвет: `status.danger.main` для непрочитанного; role-цвет — только для role-related счётчиков.
- Консолидация: `v1/BellBadge`, badge в `BottomNav`.

---

## 12. Tabs

- Segment tabs (`v1/SegmentTabs`, `RoleTabs`): height 40–44, selected = soft role/brand bg + main text, unselected = `text.secondary`; radius 12 (container pill 999 допустим).
- Labels: 14/600, `maxFontSizeMultiplier 1.15`.
- Selected state ≠ только цвет: поддержка weight/underline/indicator.

---

## 13. Headers

**Канон root-экранов: Bell слева, Menu/Hamburger справа** (зафиксировано в ТЗ; аудит: `BrandHeader`/`BrandBarWithShare` имеют green back arrow + green bell — требуется приведение к канону там, где нарушено).

- Единые: высота 56 + safe-area top; horizontal padding 16; icon 22–24; touch target 44/48; badge positioning по §11.
- Title: `h3` 18/600, одинаковая baseline на всех root screens.
- Длинный контекст (маршрут «Хоргос → Алматы») — ellipsis в subtitle, не разрушает header.
- Chat header — см. §17.7.

---

## 14. Bottom Navigation

- Driver: **Грузы / Мои рейсы / Сделки / Профиль**; Shipper: **Грузы / Машины / Сделки / Профиль** (labels из i18n, RU/ZH/EN).
- Аудит: текущий `BottomNav` использует Feather + MaterialCommunityIcons (`handshake`) — **смешение библиотек устраняется**: все иконки Feather (или единая замена), `handshake` → Feather-эквивалент/custom.
- Аудит: `ROLE_ACCENT` driver=client=green — по ТЗ 2026 selected tab у Shipper = `role.shipper.main`.
- Height: 56 + safe-area bottom (не прыгает между устройствами); icon 24; label 11.5/600; badge по §11; selected = icon+label role color + label 600 (не только цвет).

---

## 15. Icons

- **Единая система: Feather (outline), stroke 2.** Filled, другие stroke width и другие библиотеки — запрещены без задокументированной причины.
- Размеры: UI icons 20–24; header 22–24; small contextual 16–20; floating/map actions 24 внутри target ≥44/48.
- Эмодзи в UI — запрещены (owner ТЗ designSystemV2); эмодзи — только внутри пользовательского контента чата.
- Аудит-исключения к миграции: `MaterialCommunityIcons` (BottomNav ×2), `FontAwesome` ×1.

---

## 16. Avatars

- Размеры: 24 (inline), 32 (list compact), 40–44 (notification/chat rows), 56 (profile header), 96 (profile page).
- Radius: круг; fallback — инициалы на `surface.muted` с `text.secondary`.
- Presence/role indicator — dot 10–12 с обводкой 2, role-цвет только как indicator, не как заливка аватара.

---

## 17. Chat

### 17.1. Фон
Мягкий спокойный светлый фон (`surface.app` / чуть теплее `#F5F7F6`), покрывает header-to-composer, safe-area, пространство за сообщениями и keyboard transition. Никаких белых дыр/полос. Аудит: legacy `ChatScreen` использует `#111B21` dark-bg и `#D9FDD3` WhatsApp-зелёный bubble — мигрирует на токены.

### 17.2. Сообщения
- Text 16 / lineHeight 21–22.
- Timestamp 11.5, `text.muted`.
- Date separator 12.5, pill на `surface.muted`.
- Max-width bubble: 76–80% доступной ширины; короткое «Да» не растягивается.

### 17.3. Цвета пузырей
- Outgoing: мягкий светло-зелёный `#DCF2E4` (замена кислотному WhatsApp `#D9FDD3`), text почти чёрный `text.primary`, tail-угол 4dp.
- Incoming: `#FFFFFF` с border `border.default` (отделение от фона).
- Статусы sending/sent/delivered/read/failed — визуально тихие: ticks 14–16, read = `status.info.main`, failed = `status.danger.main` + retry.

### 17.4. Voice message
- Collapsed height: 68 (диапазон 64–72).
- Play/Pause icon 22–24, touch target ≥44/48.
- Состав: Play/Pause + waveform/progress + duration + current progress + playback speed (1/1.5/2 — уже есть в коде) + status + «В текст».
- Никаких огромных speaker icons.
- Аудит: `VoiceMessageBubble` (207 строк, rates 1/1.5/2, transcript) — базовая структура соответствует; требуется доводка размеров/waveform до канона.

### 17.5. Composer
Канон: `[ + ] [ message field … emoji ] [ microphone ] [ Send ]`.
- Plus 22–24; text 16; emoji 20–22; mic 22–24; send 22–24 или компактная профессиональная кнопка.
- Default — одна строка; растёт при multiline; maxHeight ~120; дальше — scrollable.
- Все иконки — touch target ≥44/48 (hitSlop 8–12).

### 17.6. Keyboard
Android 15/16 + iOS: composer непосредственно над клавиатурой. Запрещены: keyboard overlay, двойной нижний padding, gap, composer за keyboard, прыжок сообщений, потеря scroll-позиции. (Известные регрессии по истории веток: `fix/android-deal-chat-keyboard-20260901` — не допустить отката.)

### 17.7. Chat header
Компактный (56–64): back + avatar 32–36 + имя + маршрут/контекст сделки + actions. Длинный маршрут — ellipsis, не разрушает header. Дублирующаяся информация убирается.

### 17.8. Attachments (Plus menu)
Grid: Camera / Photo / Document / Location / Contact / Catalog / Quick reply. Одинаковые плитки (56 icon tile, label 12), одна icon-система, спокойный sheet (§21).

---

## 18. Notifications

### 18.1. Внутренний notification center
- Row height 64–72; icon/avatar 40–44; title 15–16/500–600; body 14; timestamp 11–12; unread indicator компактный (dot 8, `status.info.main` или role); padding 12–16.
- Push не выглядит как огромная карточка.
- Аудит: `NotificationsScreen.js` (251 строка) — привести row к спецификации; разделить системный push ОС / внутренний центр / badge-count.

### 18.2. Системный push (контент)
- Быстро читается; без дублей; без внутренних технических названий; локализован; сообщает событие/действие.
- Шаблон: `Новое предложение` / `Алматы → Москва · 5 000 USD`; `Водитель начал рейс` / `Хоргос → Алматы`.
- Backend payload проверяется на tech-leak (исторический фикс «tech-leak в чатах» из designSystemV2 Phase 1 — не откатывать).

---

## 19. Deal UI

- За 1–2 секунды из карточки сделки читаются: маршрут, вторая сторона, статус, груз, цена, дата, что произошло, что дальше.
- Статус — chip по §10, не половина карточки.
- Главный action очевиден: один Primary, остальное — Secondary/Tertiary.
- Проверять обе роли (Driver и Shipper), все статусы FSM (исторические: `fix/deal-chat-received-fsm`, `fix/rc1-dedupe-deal-events` — не ломать логику, менять только визуал).
- `DealWorkspaceScreenV2` (1848 строк) и `DealRoom` — главные объекты миграции на токены; статусная шкала → `status.*`, role-акценты → `role.*`.
- Timeline (`DealStatusTimeline`): текущий шаг — role/main color, пройденные — `status.neutral`, будущие — `text.muted`.

---

## 20. Map overlays

- Контролы на карте: 48×48 target, icon 24, white/85% surface + blur (glass допустим только здесь), radius 14, shadow лёгкая.
- Route line: brand primary 4dp; border/CGR-точки — `status.info`; driver position — role color.
- Overlay-панели: `surface.card` + radius 16, max-height 45% экрана, drag handle 36×4.
- Не ломать: yandex/here provider logic, GPS evidence (много исторических фиксов) — меняются только стили overlay-слоёв.

---

## 21. Modals / Bottom Sheets

- Sheet: radius top 20, handle 36×4 `border.strong`, padding 16, max-height 90%.
- Modal (center): radius 16, padding 20, max-width 400 (web 440 shell).
- Overlay: `surface.overlay` rgba(16,24,20,0.48); закрытие по тапу — только если несёмантически (подтверждения — нет).
- Консолидация: `AppConfirmModal`, `v1/BottomSheet`, `BidModal`, `EditCargoModal`, `RatingModal`, `ShareModal`, `LocationPickerModal`, `DateOfBirthSheet`, `RegistrationHelpSheet`.
- Destructive-подтверждения: кнопка `status.danger.main`, без двойного подтверждения.

---

## 22. Loading

- Primary: `ActivityIndicator` color `brand.primary`.
- Full-screen: spinner + подпись 14sp `text.secondary`; фон `surface.app`.
- Inline button loading: spinner заменяет label, ширина кнопки не меняется (текущее поведение `PrimaryButton` сохранить).
- Pull-to-refresh: brand primary tint.

---

## 23. Skeleton

- Единый `Skeleton.js` (уже есть) — канон: base `surface.muted`, shimmer `surface.lift` → `surface.muted`, radius по скелетируемому элементу (card 16, text 8, avatar circle).
- Ширины: текст 40%/70%/55% ритм; карточка — повторяет реальную иерархию.
- Не использовать spinner вместо skeleton для списков (feed, deals, chats).

---

## 24. Empty states

- Единый `EmptyState.js` (уже есть) — канон: иллюстрация/outline icon 48 `text.muted`, title `h3`, body `bodySmall` `text.secondary`, один Primary action (опционально).
- Никаких эмодзи в empty states.
- Вертикальное центрирование в контентной зоне, не посередине экрана с учётом header/tab.

---

## 25. Error states

- Inline (формы): текст 12.5 `status.danger.main` + icon 14, под полем.
- Banner: `status.danger.soft` bg + danger text, radius 12, padding 12–16, action справа.
- Full-screen error: icon 48, title, body, Retry (Primary) + «Назад» (Tertiary).
- `ErrorBoundary` экран — по тому же шаблону; никаких stack trace пользователю (tech-leak запрещён).
- Offline: `OfflineBanner` — `status.warning.soft`, не блокирует контент.

---

## 26. Touch targets

- Минимум: **44×44pt iOS, 48×48dp Android** — для back, bell, menu, bookmark, mic, emoji, plus, send, play, close, map controls, attachment, status actions.
- Визуальная иконка 20–24 внутри; недостающее добирается `hitSlop` (8–12) или padding.
- Аудит: hitSlop задан только в ~10 файлах → обязательный проход по всем icon-only TouchableOpacity/Pressable (чек-лист миграции).
- Соседние targets — зазор ≥8.

---

## 27. Light/Dark rules

- Обе темы — first-class: каждый semantic token имеет light/dark пару (§1.2/§1.3).
- Переключение через `ThemeContext` (auto/light/dark, сохранение `ur_theme`) — сохраняется.
- Тени в dark заменяются border/elevation-overlay; orange/green в dark — осветлённые варианты (§1.3), насыщенные brand-заливки не используются для больших поверхностей.
- Аудит: сейчас dark-палитра живёт в `designV1.js` и `utils/theme.js` с расхождениями (`#0F1512` vs производные) — консолидация в один token-map; 34 экрана на `useV1Colors()` мигрируют на единый хук `useTokens()`.

---

## 28. Responsive rules

- App-shell web max-width 440 (AppShell) — сохранить для mobile-flow; дашборд/админ-страницы — responsive grid (§5).
- Smallest supported width: 320–360 — обязательный прогон всех кнопок/статусов (§7 checklist).
- Android font scaling 1.3× — обязательный прогон ключевых экранов (Deals, DealWorkspace, Chat, Feed, Profile).
- Горизонтальный overflow запрещён везде; длинные RU-строки — wrap; таблицы → карточки на mobile.
- Landscape: не целевой режим для mobile-flow; не должен ломать layout (no crash, scroll доступен).

---

## 29. Governance и процесс миграции (в этой ветке)

1. **Один источник:** новый модуль `src/theme/tokens2026.ts` (colors/spacing/radius/typography/components) + хук `useTokens()`. Файлы `theme.js`, `designSystemV2.ts`, `brandV2.js`, `utils/theme.js` после миграции потребителей объявляются deprecated и удаляются отдельным коммитом.
2. **Без big-bang:** миграция экранами: сначала shared-компоненты (Button, Chip, Card, Input, Header, BottomNav), затем экраны по приоритету: Deals/DealWorkspace → Chat/Composer/Voice → Notifications → Feed → Profile → остальные.
3. **Не трогаем логику параллельных команд:** chat/voice/composer/notifications/auth/deals/GPS/localization — меняются только стили/размеры; бизнес-логика, API-вызовы, FSM — без изменений. Известные регрессионные зоны (keyboard Android, composer layout, push FSM, GPS evidence) — только визуальная доводка.
4. **Каждый PR-этап:** скриншоты light/dark × RU/ZH/EN × smallest width, WCAG-проверка новых пар fg/bg (≥4.5:1 для текста, ≥3:1 для UI).
5. **Merge:** только PR → независимый review → физическая QA → решение о merge. Самостоятельный merge в main не выполняется.

---

## Приложение A. Ключевые расхождения «код vs ТЗ 2026» (план исправлений)

| # | Нахождение | Файл(ы) | Действие |
|---|---|---|---|
| A1 | Shipper/client role color = green (как driver) | `ui/v1/BottomNav.js` (`ROLE_ACCENT`), `theme/designV1.js` (`cargoOwner`) | Ввести `role.shipper.*` orange family |
| A2 | 5 конкурирующих theme-модулей | §0.1 | Консолидация в `tokens2026` |
| A3 | 205 уникальных цветов, хвосты slate/indigo/pink/lime/cyan | весь `src/` | Миграция на палитру §1.2, удаление внепалитренных |
| A4 | Дробные fontSize (10.5–16.5), 40 размеров | весь `src/` | Шкала §2.2 (chat-исключения в tokens) |
| A5 | Смешение icon-библиотек | `BottomNav.js` (MCI), 1× FontAwesome | Только Feather |
| A6 | hitSlop почти отсутствует | icon-only кнопки | Проход §26 |
| A7 | WhatsApp `#D9FDD3` outgoing bubble | `screens/ChatScreen.js` | `chat.bubble.outgoing` #DCF2E4 |
| A8 | `allowFontScaling`/`maxFontSizeMultiplier` не заданы | весь `src/` | Политика §2.3 |
| A9 | spacing/radius хвосты случайных значений | весь `src/` | Шкалы §4/§6 |
| A10 | 6 параллельных красных и 6 синих | весь `src/` | `status.danger.*`, `status.info.*` |
