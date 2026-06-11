# Driver verification onboarding — design references

> **HUMAN-ONLY** files. Не импортируй их в production-UI.
> Не рендери как app screens.
> Не используй как runtime assets.

## Что здесь лежит

5 full-screen design mockup'ов (941×1672 px) от дизайнера. Это
**референсы для разработки**, а не assets для приложения:

| Файл | Назначение |
| --- | --- |
| `01-personal-photo-screen.png` | Реф для Personal Photo step (камера-only, 4 примера: 1 good + 3 bad) |
| `02-selfie-with-license-screen.png` | Реф для Selfie with License step (камера-only, 1 good + 1 bad) |
| `03-driver-license-front-screen.png` | Реф для Driver License front step (камера + галерея, 1 good + 3 bad) |
| `04-truck-exterior-screen.png` | Реф для Truck Exterior step (камера + галерея, 1 good + 1 bad) |
| `05-truck-interior-screen.png` | Реф для Truck Interior step (камера + галерея, 1 good + 1 bad) |

## Что с этим делать

✅ **Правильно:**
1. Смотреть на референс глазами.
2. Воспроизводить структуру в **React Native** через существующие
   компоненты:
   - `src/components/verification/VerificationStepLayout.js`
     — header с прогрессом + back/close + sticky footer
   - `src/components/verification/InstructionBulletList.js`
     — буллеты с маркерами
   - `src/components/verification/GoodBadExampleSection.js`
     — horizontal scroll «✓ Хорошие примеры» + «✕ Так не подойдёт»
   - `src/components/verification/UploadActionButtons.js`
     — `mode='camera-only'` или `mode='camera+gallery'`
   - `src/components/verification/VerificationProgress.js`
     — «X из Y · пунктов заполнено»
   - `src/components/verification/ExampleImageCard.js`
     — отдельная карточка примера; рендерит neutral placeholder если
     runtime PNG ещё не доехал

✅ **Тексты вытаскивать через `t()`**, ключи живут в
`src/utils/i18n.js` под префиксом `verification_*` × RU/EN/KK/ZH.

## ❌ Чего НЕ делать

- ❌ `<ImageBackground source={require('docs/design/...')}>` —
  full-screen дизайн как фон экрана. Это статичная PNG'а, она не
  адаптируется к safe area, теме, языку, размеру шрифта.
- ❌ Импортировать эти PNG'и в src/. Bundler потащит ~7 MB design
  refs в release-сборку.
- ❌ Использовать их как `selfie_good.png` / `truck_exterior_good.png`
  и т.д. — runtime assets живут в **другом** каталоге и должны быть
  отдельно вырезаны (cropped) без UI-текста, кнопок, статус-баров и
  фрейма телефона.

## Runtime assets — отдельная история

Реальные runtime PNG'и (без UI-чрома, только сама фотография примера)
живут в:

```
src/assets/onboarding/verification/
├── person/
│   ├── selfie_good.png            ← pending от дизайна
│   ├── selfie_bad_profile.png
│   ├── selfie_bad_sunglasses.png
│   ├── selfie_bad_group.png
│   ├── selfie_license_good.png
│   └── selfie_license_bad.png
├── license/
│   ├── license_front_good.png
│   ├── license_front_bad_glare.png
│   ├── license_front_bad_bw.png
│   ├── license_front_bad_screenshot.png
│   ├── license_back_good.png
│   ├── license_back_bad.png
│   ├── srts_good.png
│   └── srts_bad.png
├── vehicle/
│   ├── truck_exterior_good.png
│   ├── truck_exterior_bad.png
│   ├── truck_interior_good.png
│   └── truck_interior_bad.png
└── success/
    └── success_illustration.png
```

Когда дизайн нарежет конкретные примеры (без обрамления экрана):
1. Положить файл в нужный sub-каталог с **каноническим именем**.
2. В `src/assets/onboarding/verification/index.js` найти строку:
   ```js
   'person/selfie_good': null /* require('./person/selfie_good.png') */,
   ```
   и заменить на:
   ```js
   'person/selfie_good': require('./person/selfie_good.png'),
   ```
3. `ExampleImageCard` подхватит автоматически, без правок экранов.

До тех пор `ExampleImageCard` рендерит neutral placeholder, чтобы
build не падал и dashboard работал.

## Замеченные опечатки в reference screens

Это design draft, в нём есть ошибки, которые **не нужно копировать**
в runtime текст:

| Reference | Опечатка | Правильно |
| --- | --- | --- |
| 01-personal-photo-screen | «поучать больше предложений» | «получать больше предложений» |
| _(если встретите ещё)_ | «Испольуйте» | «Используйте» |

i18n текущей реализации (`verification_item_*_subtitle`,
`verification_action_*`) уже использует правильное написание.

## Структура каждого reference (для разработчика PR #105)

Все 5 экранов идут одинаково сверху вниз:
1. **Title** (28–30 sp, bold, в PageTitle стиле).
2. **2–3 bullet'а** с зелёной круглой галочкой (✓) и текстом инструкции.
3. **Зона good example** — большой контейнер с зелёным ✓-индикатором в углу.
4. **Bad examples** (если есть) — horizontal row или grid с красным ✕.
5. **Sticky bottom** — primary CTA «Сделать фото» (зелёный) + опциональный
   secondary «Выбрать из галереи» (outline).
