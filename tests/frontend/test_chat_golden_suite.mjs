/**
 * CHAT GOLDEN REGRESSION SUITE (§12) — прогонять после ЛЮБОГО изменения чата.
 *
 * Причина существования: чат правился в одном месте, а другой экран
 * оставался старым, и дефекты возвращались. Здесь зафиксированы КОНТРАКТЫ
 * семи физически подтверждённых дефектов (04.09.2026) плюс канон
 * «единственная живая реализация чата».
 *
 * CHAT-01 text send RU            CHAT-14 auto-send → second recording
 * CHAT-02 text receive ZH         CHAT-15 60 sec offline retry
 * CHAT-03 ZH→RU translation       CHAT-16 no duplicate
 * CHAT-04 RU→ZH translation       CHAT-17 voice compact bubble
 * CHAT-05 keyboard composer       CHAT-18 old voice retry
 * CHAT-06 keyboard open/close     CHAT-19 background/resume
 * CHAT-07 multiline input         CHAT-20 Android Back with keyboard
 * CHAT-08 date separator          CHAT-21 RU
 * CHAT-09 voice basic             CHAT-22 ZH
 * CHAT-10 voice playback          CHAT-23 Light
 * CHAT-11 playback → new record   CHAT-24 Dark
 * CHAT-12 59 sec manual send      CHAT-25 small screen
 * CHAT-13 60 sec auto-send
 *
 * Run: node tests/frontend/test_chat_golden_suite.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');
const stripJs = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

let passed = 0;
let failed = 0;
function check(id, cond, msg) {
  if (cond) { console.log(`  ✅ ${id} ${msg}`); passed++; }
  else { console.error(`  ❌ ${id} FAIL: ${msg}`); failed++; }
}

const v2Raw = read('src/screens/DealWorkspaceScreenV2.js');
const v2 = stripJs(v2Raw);
const bubbleRaw = read('src/components/VoiceMessageBubble.js');
const recorderRaw = read('src/utils/voiceRecorder.js');
const recorder = stripJs(recorderRaw);
const kbHook = read('src/hooks/useChatKeyboardInset.js');
const sepMod = read('src/utils/chatDateSeparators.js');
const i18n = read('src/utils/i18n.js');
const places = read('src/utils/places.js');
const navigator = read('src/navigation/AppNavigator.js');

console.log('\n=== §11 КАНОН: единственная живая реализация чата ===');
{
  // Главная причина возвратных регрессий — правки уходили в мёртвые файлы.
  check('CANON', /component=\{ChatScreenV2\}/.test(navigator),
    'маршрут Chat обслуживает ChatScreenV2');
  const chatV2 = read('src/screens/ChatScreenV2.js');
  check('CANON', /DealWorkspaceRoute/.test(chatV2),
    'ChatScreenV2 ведёт в DealWorkspaceRoute');
  check('CANON', /DealWorkspaceScreenV2/.test(read('src/components/deal/DealWorkspaceRoute.js')),
    'DealWorkspaceRoute монтирует DealWorkspaceScreenV2');

  // Legacy-экраны обязаны оставаться недостижимыми: если кто-то их снова
  // подключит, правки чата опять начнут расходиться.
  const allSrc = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(js|jsx)$/.test(e.name)) allSrc.push(full);
    }
  };
  walk(path.join(ROOT, 'src'));
  allSrc.push(path.join(ROOT, 'App.js'));
  for (const legacy of ['ChatScreen', 'DealWorkspaceScreen']) {
    const importers = allSrc.filter((f) => {
      if (path.basename(f) === `${legacy}.js`) return false;
      const src = fs.readFileSync(f, 'utf-8');
      return new RegExp(`['"][^'"]*screens/${legacy}['"]`).test(src);
    });
    check('CANON', importers.length === 0,
      `${legacy}.js остаётся недостижимым (импортёров: ${importers.length})`);
  }
}

console.log('\n=== CHAT-01/02/21/22 текст, RU/ZH, приём ===');
{
  check('CHAT-01', /testID="deal-chat-send"/.test(v2), 'кнопка отправки текста на месте');
  check('CHAT-01', /const sendText = React\.useCallback/.test(v2), 'sendText существует');
  check('CHAT-21/22', /const \{ t, lang \} = useI18n\(\)/.test(v2), 'экран берёт t и lang из i18n');
  const langs = ['RU', 'KK', 'ZH', 'EN'];
  // ui-словарь экрана обязан покрывать все 4 языка (иначе ZH получит русский).
  for (const key of ['recording', 'voiceMessage', 'statuses']) {
    const n = (v2Raw.match(new RegExp(`(?<![A-Za-z0-9_])${key}:`, 'g')) || []).length;
    check('CHAT-22', n >= langs.length, `ui.${key} определён во всех ${langs.length} языках (найдено ${n})`);
  }
}

console.log('\n=== CHAT-03/04 перевод в обе стороны ===');
{
  check('CHAT-03/04', /translations\[item\.id\]/.test(v2), 'перевод сообщения рендерится');
  check('CHAT-03/04', /showOriginal/.test(v2), 'есть переключение на оригинал');
  check('CHAT-03/04', /s\.translateBtn/.test(v2), 'кнопка перевода на месте');
}

console.log('\n=== CHAT-05/06/07/20 клавиатура ↔ composer (§6) ===');
{
  check('CHAT-05', fs.existsSync(path.join(ROOT, 'src/hooks/useChatKeyboardInset.js')),
    'канонический хук клавиатуры существует');
  check('CHAT-05', /useChatKeyboardInset\(\)/.test(v2), 'экран использует канонический хук');
  check('CHAT-05', /marginBottom: attachOpen \|\| emojiOpen \? 8 : composerBottomInset/.test(v2),
    'composer берёт отступ из хука, а не из статического insets.bottom');
  check('CHAT-05', !/marginBottom:\s*Math\.max\(insets\.bottom \+ 8, 12\)/.test(v2),
    'старый статический double-inset убран');
  check('CHAT-06', /keyboardDidShow|keyboardWillShow/.test(kbHook), 'хук слушает показ клавиатуры');
  check('CHAT-06', /keyboardDidHide|keyboardWillHide/.test(kbHook), 'хук слушает скрытие клавиатуры');
  check('CHAT-06', /keyboardDidChangeFrame/.test(kbHook),
    'учитывается смена высоты (раскладка RU↔ZH) без hide/show');
  check('CHAT-05', !/marginBottom:\s*\d{3}/.test(v2) && !/paddingBottom:\s*300/.test(v2),
    'нет hardcoded высоты клавиатуры под один телефон');
  check('CHAT-05', /keyboardHeight\s*:\s*0/.test(kbHook) || /Platform\.OS === 'android' \? keyboardHeight : 0/.test(kbHook),
    'iOS не получает двойной подъём (KeyboardAvoidingView + свой inset)');
  check('CHAT-07', /multiline/.test(v2), 'многострочный ввод включён');
  check('CHAT-07', /COMPOSER_INPUT_MAX_HEIGHT/.test(v2), 'высота ввода ограничена (не растёт бесконечно)');
  check('CHAT-20', /if \(isKeyboardVisible\) \{ Keyboard\.dismiss\(\); return true; \}/.test(v2),
    'Back сначала закрывает клавиатуру, второй Back выходит');
}

console.log('\n=== CHAT-08 разделители дней (§4) ===');
{
  check('CHAT-08', fs.existsSync(path.join(ROOT, 'src/utils/chatDateSeparators.js')),
    'единый модуль разделителей существует');
  check('CHAT-08', /withDateSeparators\(messages/.test(v2), 'экран использует withDateSeparators');
  check('CHAT-08', /data=\{messagesWithDays\}/.test(v2), 'список рендерит сообщения с разделителями');
  check('CHAT-08', /item\.daySeparator/.test(v2), 'есть ветка рендера разделителя');
  check('CHAT-08', /localDayKey/.test(sepMod), 'день считается по ЛОКАЛЬНОЙ дате, не UTC');
  check('CHAT-08', /key !== prevKey/.test(sepMod), 'разделитель только при смене дня (нет дублей при prepend)');
  for (const key of ['chat_day_today', 'chat_day_yesterday']) {
    const n = (i18n.match(new RegExp(`(?<![A-Za-z0-9_])${key}:`, 'g')) || []).length;
    check('CHAT-08', n === 4, `${key} локализован в 4 языках (найдено ${n})`);
  }
  check('CHAT-08', /今天/.test(i18n) && /昨天/.test(i18n), 'ZH-подписи «сегодня/вчера» присутствуют');
  check('CHAT-08', !/HTML_LANG = \{[^}]*\}\s*;?\s*$/m.test(sepMod) && !/from '\.\/i18n'/.test(sepMod),
    'модуль не дублирует карту локалей (locale приходит параметром)');
}

console.log('\n=== CHAT-09/12/13/14/16 запись, 60 сек, auto-send (§8/§10) ===');
{
  check('CHAT-13', /export const MAX_VOICE_DURATION_SEC = 60/.test(recorder),
    'лимит 60 сек объявлен ОДИН раз в каноническом рекордере');
  check('CHAT-13', /MAX_VOICE_DURATION_SEC/.test(v2), 'экран берёт лимит из рекордера (нет магического 60)');
  check('CHAT-13', /if \(elapsed >= MAX_VOICE_DURATION_SEC\)/.test(v2),
    'на 60-й секунде срабатывает авто-финализация');
  check('CHAT-13', /clearInterval\(timer\);\s*finalizeVoice\(\)/.test(v2),
    'таймер останавливается и вызывает finalizeVoice');
  check('CHAT-12/13', /const finalizeVoice = React\.useCallback/.test(v2),
    'ручной Send и авто-send идут через ОДНУ функцию');
  check('CHAT-16', /if \(voiceFinalizingRef\.current\) return;/.test(v2),
    'защита от двойной отправки одной записи (exactly one)');
  {
    // CHAT-14: авто-отправка НЕ должна сама начинать следующую запись.
    // Проверяем тела finalizeVoice и sendRecordedVoice: там не может быть
    // startRecording. Легальный ручной старт живёт только в toggleVoice.
    const bodyOf = (name) => {
      const i = v2.indexOf(`const ${name} = React.useCallback`);
      if (i === -1) return '';
      const end = v2.indexOf('React.useCallback', i + 40);
      return v2.slice(i, end === -1 ? v2.length : end);
    };
    const finalizeBody = bodyOf('finalizeVoice');
    const sendBody = bodyOf('sendRecordedVoice');
    check('CHAT-14', finalizeBody.length > 0 && !/startRecording/.test(finalizeBody),
      'finalizeVoice не запускает новую запись автоматически');
    check('CHAT-14', sendBody.length > 0 && !/startRecording/.test(sendBody),
      'sendRecordedVoice не запускает новую запись автоматически');
    check('CHAT-14', /const toggleVoice[\s\S]{0,600}?voice\.startRecording\(\)/.test(v2),
      'следующая запись начинается только по явному нажатию mic (toggleVoice)');
  }
  check('CHAT-09', /testID="deal-chat-voice"/.test(v2), 'кнопка микрофона на месте');
  check('CHAT-09', /testID="deal-chat-recording-send"/.test(v2), 'кнопка отправки записи на месте');
  check('CHAT-13', /testID="deal-chat-record-timer"/.test(v2), 'таймер записи адресуем в тестах');
  check('CHAT-13', /Math\.floor\(recordSecs \/ 60\)/.test(v2),
    'таймер показывает реальные минуты (раньше «0:» было захардкожено)');
}

console.log('\n=== §9 кодек: 60 сек не должно упираться в серверный лимит ===');
{
  check('§9', /VOICE_RECORDING_OPTIONS/.test(recorder), 'задан явный речевой профиль записи');
  check('§9', !/RecordingOptionsPresets\.HIGH_QUALITY/.test(recorder),
    'HIGH_QUALITY (44100/стерео/128k) больше не используется');
  check('§9', /sampleRate: 22050/.test(recorder), 'sampleRate 22050 (речь)');
  check('§9', /numberOfChannels: 1/.test(recorder), 'моно');
  check('§9', /bitRate: 48000/.test(recorder), 'битрейт 48 kbps');
  // 60 сек × 48 kbps ≈ 360 KB — на порядок ниже серверного потолка 10 MB.
  const estimatedBytes = (48000 / 8) * 60;
  check('§9', estimatedBytes < 10 * 1024 * 1024,
    `оценка 60-сек файла ${Math.round(estimatedBytes / 1024)} KB < серверного лимита 10 MB`);
  check('§9', /extension: '\.m4a'/.test(recorder), 'контейнер .m4a сохранён (MIME/загрузка не меняются)');
}

console.log('\n=== CHAT-10/11/18 воспроизведение и retry (§2) ===');
{
  check('CHAT-18', /isVoice\s*\n?\s*\?\s*issuedUrl/.test(v2) || /isVoice$/m.test(v2) && /\? issuedUrl/.test(v2),
    'голос всегда получает СВЕЖИЙ подписанный URL (кэш его не перебивает)');
  check('CHAT-18', /attachmentUrlCache\.current\.get\(cacheKey\) \|\| issuedUrl/.test(v2),
    'для фото анти-мигание сохранено (контракт PR #255)');
  check('CHAT-18', /testID="voice-play-retry"/.test(bubbleRaw),
    'при отказе воспроизведения есть видимый retry, а не только тост');
  check('CHAT-18', /chat_attach_retry/.test(bubbleRaw),
    'retry использует существующий локализованный ключ (без дублей)');
  check('CHAT-10', /voice\.toggle\(uri\)/.test(bubbleRaw), 'play/pause через канонический toggle');
  check('CHAT-11', /await this\.stop\(\)/.test(recorder),
    'startRecording глушит playback перед захватом микрофона (общий AudioManager)');
  check('CHAT-10', /state\.uri === uri/.test(bubbleRaw), 'активен только бабл своего трека');
}

console.log('\n=== CHAT-15/19 сбой сети, background/resume ===');
{
  check('CHAT-15', /sendStatus: 'failed'/.test(v2), 'сбой отправки даёт видимый failed-статус');
  check('CHAT-15', /sendError/.test(v2), 'сохраняется причина ошибки для retry');
  check('CHAT-15', /doc_error_too_large|voice_error_upload/.test(v2),
    'причины отказа загрузки различаются, а не один общий текст');
  check('CHAT-19', /AppState\.addEventListener/.test(v2), 'экран реагирует на возврат в active');
  check('CHAT-19', /voice\.stopRecording\?\.\(\)/.test(v2) && /voice\.stop\?\.\(\)/.test(v2),
    'unmount освобождает и микрофон, и playback');
}

console.log('\n=== CHAT-17/23/24/25 компактность и темы (§3/§13) ===');
{
  check('CHAT-17', /voiceBubbleMinWidth/.test(bubbleRaw), 'ширина бабла зависит от длительности');
  check('CHAT-17', !/wrap: \{ minWidth: 172 \}/.test(bubbleRaw),
    'фиксированный minWidth 172 убран (короткое голосовое больше не раздуто)');
  check('CHAT-17', /secondaryRow/.test(bubbleRaw),
    'скорость и «В текст» в ОДНОМ ряду (минус лишняя вертикальная строка)');
  check('CHAT-17', /flexWrap: 'wrap'/.test(bubbleRaw),
    'длинные ZH/KK подписи переносятся, а не обрезаются');
  check('CHAT-17', /minHeight: 22/.test(bubbleRaw), 'touch target вторичных действий сохранён');
  check('CHAT-17', /hitSlop=\{\{ top: 8, bottom: 8, left: 8, right: 8 \}\}/.test(bubbleRaw),
    'у play увеличенная зона нажатия');
  // Темы: цвета берутся из токенов, а не хардкодом в разделителе/метриках.
  check('CHAT-23/24', /colors\.surface/.test(v2) && /colors\.border/.test(v2),
    'разделитель дня и карточки используют токены темы');
  check('CHAT-25', /numberOfLines=\{1\}/.test(bubbleRaw),
    'на узком экране подписи не ломают верстку');
}

console.log('\n=== §5/§15 ZH-локализация и города ===');
{
  check('§5', /localizeKnownPlacesInText/.test(places),
    'есть резолвер известных городов внутри system-текста');
  check('§5', /'💰 Ставка':/.test(places), 'заголовок «Ставка» локализуется (был русским в ZH)');
  check('§5', /'📦 Заказ':/.test(places), 'заголовок «Заказ» локализуется');
  check('§5', /value\.startsWith\(`\$\{prefix\} `\)/.test(places),
    'префикс+сумма без « ·» тоже матчится (реальный формат сервера)');
  check('§5', /报价/.test(places) && /订单/.test(places), 'ZH-переводы заголовков присутствуют');
  check('§15', /PLACE_SEARCH_TERMS/.test(places),
    'ищутся и русские, и латинские формы города (Almaty и Алматы)');
  check('§15', /Никогда|не переводится|user/i.test(places) || /Never machine-translate/.test(places),
    'свободный user-текст машинно не переводится');
  check('§5', /localizePlace\(item\.from_city, lang\)/.test(read('src/screens/PushFilterScreen.js')),
    'сохранённые маршруты фильтра тоже локализованы');
}

console.log('\n=== §6/§16 карта: attribution и одно расстояние ===');
{
  check('§6', /MAP_ATTRIBUTION_SAFE_ZONE/.test(v2),
    'зона атрибуции провайдера зарезервирована');
  check('§6', /bottom: MAP_ATTRIBUTION_SAFE_ZONE \+ Math\.max\(insets\.bottom, 0\)/.test(v2),
    'метрики поднимаются над атрибуцией (не перекрывают её)');
  check('§6', !/metricsCard: \{ position: 'absolute', left: 12, right: 12, bottom: 12/.test(v2),
    'жёсткий bottom: 12 убран из статического стиля');
  const tripDetail = read('src/screens/TripDetail.js');
  check('§16', !/📏 \{stats\.km\}/.test(tripDetail),
    'legacy Haversine-расстояние убрано с экрана, где есть дорожная карта');
  check('§16', /~\{stats\.days\}/.test(tripDetail), 'оценка времени сохранена и помечена «~»');
  check('§16', /`~\$\{stats\.km\}/.test(read('src/screens/CargoDetail.js')),
    'там где карты нет, оценка расстояния явно помечена «~»');
  check('§16', /routeSummary\.distanceText/.test(v2),
    'каноническое расстояние — серверная дорожная геометрия');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
