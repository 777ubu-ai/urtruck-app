# UrTruck — Design System
# Этот файл — стандарт для всех экранов. Любое отклонение = ошибка.

---

## ФИЛОСОФИЯ

Dark Premium UI. Логистика — это серьёзно. Приложение должно внушать доверие,
скорость и профессионализм. Никакого белого фона, никаких пастельных цветов.
Тёмный фон, зелёный акцент, стекло.

---

## ЦВЕТА

### Основные
```
Background (фон страницы):     #0a0f1a
Surface (фон карточек):        #111827
Surface Alt (hover состояния): #1a2234
```

### Акценты
```
Primary Green (CTA, активные):  #22c55e
Primary Dark (hover кнопок):    #16a34a
Primary Glow (тени кнопок):     rgba(34, 197, 94, 0.2)
Accent Blue (информация):       #3b82f6
Accent Blue Soft:               #1e3a5f
```

### Текст
```
Text Primary (заголовки):       #ffffff
Text Secondary (описания):      #94a3b8
Text Muted (метки, хинты):      #64748b
Text Disabled:                  #475569
```

### Стекло (Glassmorphism)
```
Glass Background:   rgba(255, 255, 255, 0.04)
Glass Border:       rgba(255, 255, 255, 0.08)
Glass Hover:        rgba(255, 255, 255, 0.07)
```

### Статусы
```
Success:  #22c55e  / bg: rgba(34, 197, 94, 0.15)
Warning:  #f59e0b  / bg: rgba(245, 158, 11, 0.15)
Danger:   #ef4444  / bg: rgba(239, 68, 68, 0.15)
Info:     #3b82f6  / bg: rgba(59, 130, 246, 0.15)
```

### Скоринг цвета (0-100)
```
🟢 70-100 (Надёжный):  #22c55e
🟡 40-69  (Новичок):   #f59e0b
🔴 0-39   (Риск):      #ef4444
```

---

## ТИПОГРАФИКА

### Шрифты
```
Заголовки:  Syne (weights: 700, 800)
Текст:      DM Sans (weights: 400, 500, 600)
```

Подключение (в index.html или _layout.tsx):
```html
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
```

### Размеры
```
Display (логотип, Hero):   Syne 32px / weight 800 / letter-spacing: -1px
H1 (экран заголовок):      Syne 24px / weight 800
H2 (секция):               Syne 20px / weight 700
H3 (карточка заголовок):   Syne 16px / weight 700 / color: #22c55e
Body Large:                DM Sans 16px / weight 500
Body:                      DM Sans 15px / weight 400
Small:                     DM Sans 13px / weight 400 / color: #94a3b8
Label (uppercase):         DM Sans 11px / weight 400 / letter-spacing: 1.5px / uppercase
```

---

## КОМПОНЕНТЫ

### Кнопки

**Primary (основное действие):**
```css
background: #22c55e;
color: #ffffff;
border-radius: 12px;
padding: 14px 24px;
font-family: 'DM Sans';
font-weight: 600;
font-size: 15px;
border: none;
/* hover: */ background: #16a34a;
/* active: */ transform: scale(0.98);
```

**Secondary (второстепенное):**
```css
background: rgba(255, 255, 255, 0.06);
color: #ffffff;
border: 1px solid rgba(255, 255, 255, 0.1);
border-radius: 12px;
padding: 14px 24px;
font-family: 'DM Sans';
font-weight: 500;
font-size: 15px;
/* hover: */ background: rgba(255, 255, 255, 0.1);
```

**Ghost (текстовая кнопка):**
```css
background: transparent;
color: #94a3b8;
border: none;
font-size: 14px;
text-decoration: underline;
```

**Danger:**
```css
background: rgba(239, 68, 68, 0.1);
color: #ef4444;
border: 1px solid rgba(239, 68, 68, 0.3);
border-radius: 12px;
```

---

### Карточки

**Стандартная карточка:**
```css
background: rgba(255, 255, 255, 0.04);
border: 1px solid rgba(255, 255, 255, 0.08);
border-radius: 16px;
padding: 16px;
```

**Активная / выбранная карточка:**
```css
background: rgba(34, 197, 94, 0.05);
border: 1px solid rgba(34, 197, 94, 0.3);
border-radius: 16px;
padding: 16px;
```

**Hero карточка (крупная):**
```css
background: rgba(255, 255, 255, 0.04);
border: 1px solid rgba(255, 255, 255, 0.08);
border-radius: 20px;
padding: 20px;
```

---

### Поля ввода (Input)

```css
background: rgba(255, 255, 255, 0.05);
border: 1px solid rgba(255, 255, 255, 0.1);
border-radius: 12px;
padding: 14px 16px;
color: #ffffff;
font-family: 'DM Sans';
font-size: 15px;
placeholder-color: #475569;
/* focus: */ border-color: #22c55e; outline: none;
/* error: */  border-color: #ef4444;
```

---

### Бейджи / Статусы

```jsx
// Verified
<span style={{
  background: 'rgba(34,197,94,0.15)',
  color: '#22c55e',
  padding: '4px 10px',
  borderRadius: '20px',
  fontSize: '12px',
  fontWeight: 600
}}>✓ Verified</span>

// Pro
<span style={{
  background: 'rgba(59,130,246,0.15)',
  color: '#60a5fa',
  padding: '4px 10px',
  borderRadius: '20px',
  fontSize: '12px',
  fontWeight: 600
}}>Pro</span>

// Новичок
<span style={{
  background: 'rgba(249,115,22,0.15)',
  color: '#fb923c',
  padding: '4px 10px',
  borderRadius: '20px',
  fontSize: '12px',
  fontWeight: 600
}}>Новичок</span>
```

---

### Навигация (Bottom Tab Bar)

```css
background: rgba(10, 15, 26, 0.95);
border-top: 1px solid rgba(255, 255, 255, 0.08);
backdrop-filter: blur(10px);
padding: 12px 0 20px;

/* Активный таб */
.tab-active: color: #22c55e;
/* Неактивный таб */
.tab-inactive: color: #475569;
```

---

### Скоринг бар

```jsx
<View style={{backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 20, height: 8}}>
  <View style={{
    width: `${score}%`,
    height: 8,
    borderRadius: 20,
    backgroundColor: score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444'
  }}/>
</View>
```

---

### OTP поля (6 цифр)

```css
width: 48px;
height: 56px;
background: rgba(255, 255, 255, 0.05);
border: 1px solid rgba(255, 255, 255, 0.1);
border-radius: 12px;
font-size: 24px;
font-weight: 700;
color: #ffffff;
text-align: center;
/* filled: */ border-color: #22c55e;
/* error: */  border-color: #ef4444; background: rgba(239,68,68,0.05);
```

---

## ИКОНКИ

Размер: 20-24px (в карточках), 28px (Hero секции)
Стиль: emoji или lucide-react-native
Контейнер иконки:
```css
width: 44px;
height: 44px;
border-radius: 12px;
background: rgba(цвет, 0.15);
align-items: center;
justify-content: center;
```

Примеры:
```
🚛 Перевозчик  → bg: rgba(34,197,94,0.15)
📦 Груз        → bg: rgba(59,130,246,0.15)
📍 Геолокация  → bg: rgba(249,115,22,0.15)
💬 Чат         → bg: rgba(168,85,247,0.15)
⭐ Рейтинг     → bg: rgba(234,179,8,0.15)
🛡️ Безопасность → bg: rgba(239,68,68,0.15)
```

---

## ОТСТУПЫ (Spacing)

```
4px   — micro (иконка к тексту)
8px   — xs (внутри компонента)
12px  — sm (gap между элементами)
16px  — md (padding карточки)
20px  — lg (padding секции)
24px  — xl (отступ между блоками)
32px  — 2xl (крупные секции)
```

---

## АНИМАЦИИ

```javascript
// Появление экрана
FadeIn: duration 300ms, easing: ease-out

// Карточки (stagger)
каждая следующая карточка: delay +50ms

// Кнопка нажатие
scale: 0.96, duration: 100ms

// Toast уведомления
slide from bottom: 200ms ease-out
auto-hide: 3000ms

// Skeleton loader
opacity: 0.4 → 0.8 → 0.4, duration: 1500ms, infinite
```

---

## ФЛАГИ СТРАН

Всегда отображать в порядке:
🇰🇿 Казахстан → 🇷🇺 Россия → 🇺🇿 Узбекистан → 🇨🇳 Китай → 🇰🇬 Кыргызстан

---

## СТРУКТУРА ЭКРАНА (шаблон)

```jsx
<SafeAreaView style={{flex: 1, backgroundColor: '#0a0f1a'}}>
  {/* Хедер */}
  <View style={{
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)'
  }}>
    <Text style={{fontFamily:'Syne', fontSize:20, fontWeight:'800', color:'#fff'}}>
      Заголовок
    </Text>
  </View>

  {/* Контент */}
  <ScrollView
    style={{flex: 1}}
    contentContainerStyle={{padding: 16}}
    showsVerticalScrollIndicator={false}
  >
    {/* Карточки, списки, контент */}
  </ScrollView>

  {/* Кнопка действия (если нужна) */}
  <View style={{padding: 16, paddingBottom: 32}}>
    <TouchableOpacity style={{
      backgroundColor: '#22c55e',
      borderRadius: 12,
      padding: 16,
      alignItems: 'center'
    }}>
      <Text style={{color:'#fff', fontWeight:'600', fontSize:16}}>Действие</Text>
    </TouchableOpacity>
  </View>
</SafeAreaView>
```

---

## ЗАПРЕЩЕНО ❌

- Белый или светлый фон (#ffffff, #f5f5f5 и т.д.)
- Шрифты: Arial, Roboto, Inter, System font
- Фиолетовые градиенты (клише)
- Скругление больше 20px у карточек
- Тени без blur (flat design)
- Текст мельче 11px
- Больше 3 цветов акцента на одном экране
- Кнопки без padding (минимум 12px по вертикали)

---

## ОБЯЗАТЕЛЬНО ✅

- Каждый новый экран → фон #0a0f1a
- Заголовки → Syne 800
- CTA кнопки → #22c55e с border-radius 12px
- Карточки → glass effect (rgba белый 0.04 + border 0.08)
- Статусы → цветные бейджи с прозрачным фоном
- Skeleton при загрузке данных
- SafeAreaView на каждом экране

---

## РЕФЕРЕНС

Похожие приложения по стилю (для вдохновения):
- Binance (тёмная тема)
- Uber Driver (профессиональный UI)
- Waze (навигация, карты)

Наш стиль = Binance тёмный + зелёный акцент логистики

---

Версия: 1.0
Дата: Апрель 2026
Проект: UrTruck International Logistics
Сервер: 185.22.65.11
Стек: React Native + Expo + FastAPI + Supabase
