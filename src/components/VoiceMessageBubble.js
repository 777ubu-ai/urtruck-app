// Голосовое сообщение в чате — паритет с WhatsApp/WeChat (заявка владельца
// 28.08.2026: «нажал — идёт без остановки, паузы нету»).
//
// Что даёт (было: одна статичная иконка ▶, повторный тап = no-op):
//   • кнопка play/pause с реальным переключением иконки;
//   • живая полоса прогресса + перемотка тапом по полосе (seek);
//   • таймер: во время игры — прошедшее время, в покое — длительность;
//   • пилюля скорости 1x → 1.5x → 2x (как в WhatsApp), появляется у активного;
//   • по окончании трек сбрасывается в начало, кнопка снова play;
//   • одновременно играет только ОДИН голосовой на всё приложение.
//
// Только React Native primitives (никаких web-only API) — рендерится и в
// native, и в react-native-web. Источник состояния — voice.subscribe().
import React from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { voice } from '../utils/voiceRecorder';

const RATES = [1, 1.5, 2];

const fmt = (ms) => {
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export default function VoiceMessageBubble({
  uri,
  // Длительность из метаданных сообщения (секунды) — показываем ДО первого
  // воспроизведения, пока плеер ещё не знает реальную длину трека.
  fallbackDurationSec = 0,
  mine = false,
  sending = false,
  textColor = '#14221C',
  mutedColor = '#617067',
  accentColor = '#168759',
  t = (key) => key,
  transcript,
  transcribing = false,
  onToggleTranscript,
  onError,
  testID = 'voice-bubble',
}) {
  const [state, setState] = React.useState(() => voice.getState?.() || {
    uri: null, isPlaying: false, positionMillis: 0, durationMillis: 0, rate: 1,
  });
  const [trackWidth, setTrackWidth] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const unsub = voice.subscribe?.((next) => setState(next));
    return () => { try { unsub?.(); } catch {} };
  }, []);

  // Этот бабл активен только если плеер играет ИМЕННО его трек.
  const isActive = !!uri && state.uri === uri;
  const isPlaying = isActive && !!state.isPlaying;
  const durationMs = (isActive && state.durationMillis)
    ? state.durationMillis
    : Math.round((fallbackDurationSec || 0) * 1000);
  const positionMs = isActive ? (state.positionMillis || 0) : 0;
  const progress = durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0;

  // §2: отказ воспроизведения обязан быть ВОССТАНАВЛИВАЕМЫМ, а не разовым
  // тостом. Физически подтверждено «Не удалось воспроизвести» / 播放失败 на
  // старых голосовых: подписанная ссылка потребляется только в момент тапа,
  // и к этому времени она могла устареть. Экран теперь выдаёт голосу свежий
  // URL на каждом поллинге, а здесь остаётся видимый retry — чтобы даже при
  // сетевом сбое пользователь мог повторить, а не остался с ошибкой.
  const [playError, setPlayError] = React.useState(false);

  const onToggle = React.useCallback(async () => {
    if (!uri || busy) return;
    setBusy(true);
    try {
      const ok = await voice.toggle(uri);
      if (!ok && !isActive) {
        setPlayError(true);
        onError?.();
      } else {
        setPlayError(false);
      }
    } finally {
      setBusy(false);
    }
  }, [uri, busy, isActive, onError]);

  // Успешный старт воспроизведения снимает состояние ошибки.
  React.useEffect(() => {
    if (isPlaying && playError) setPlayError(false);
  }, [isPlaying, playError]);

  // Перемотка: тап по полосе. locationX — позиция внутри самой полосы,
  // работает одинаково в native и react-native-web.
  const onSeek = React.useCallback((event) => {
    if (!isActive || !durationMs || !trackWidth) return;
    const x = event?.nativeEvent?.locationX;
    if (typeof x !== 'number') return;
    const ratio = Math.min(1, Math.max(0, x / trackWidth));
    voice.seek?.(uri, Math.round(ratio * durationMs));
  }, [isActive, durationMs, trackWidth, uri]);

  const onCycleRate = React.useCallback(() => {
    const idx = RATES.indexOf(state.rate || 1);
    voice.setRate?.(RATES[(idx + 1) % RATES.length]);
  }, [state.rate]);

  const onSurface = mine ? 'rgba(17,27,33,0.18)' : 'rgba(17,27,33,0.14)';
  const fillColor = accentColor;
  const iconColor = accentColor;
  const timeColor = mutedColor;
  const transcriptVisible = !!transcript?.visible && !!transcript?.transcriptText;
  const transcriptAction = transcribing
    ? '...'
    : transcriptVisible
      ? t('voice_hide_text')
      : transcript?.transcriptText
        ? t('voice_show_text')
        : t('voice_to_text');
  const showTranscriptAction = typeof onToggleTranscript === 'function';

  // Ширина по длительности: показываем известную длину (метаданные или
  // реальная из плеера), чтобы короткое голосовое было компактным.
  const knownDurationSec = Math.round((durationMs || 0) / 1000) || fallbackDurationSec || 0;

  return (
    <View style={[s.wrap, { minWidth: voiceBubbleMinWidth(knownDurationSec) }]} testID={testID}>
      <View style={s.row}>
        <TouchableOpacity
          onPress={onToggle}
          disabled={!uri || sending}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[s.playBtn, { borderColor: onSurface }]}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? 'pause voice message' : 'play voice message'}
          testID={isPlaying ? 'voice-pause-btn' : 'voice-play-btn'}
        >
          {sending
            ? <ActivityIndicator size="small" color={iconColor} />
            : <Feather name={isPlaying ? 'pause' : 'play'} size={15} color={iconColor} />}
        </TouchableOpacity>

        <Pressable
          onPress={onSeek}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          style={s.trackHit}
          testID="voice-progress-track"
        >
          <View style={[s.track, { backgroundColor: onSurface }]}>
            <View style={[s.fill, { width: `${progress * 100}%`, backgroundColor: fillColor }]} />
            {isActive ? (
              <View style={[s.knob, { left: `${progress * 100}%`, backgroundColor: fillColor }]} />
            ) : null}
          </View>
        </Pressable>

        <Text style={[s.time, { color: timeColor }]} testID="voice-time">
          {isActive && positionMs > 0 ? fmt(positionMs) : fmt(durationMs)}
        </Text>
      </View>

      {/* §3 компактность: скорость и «В текст / 转文字» раньше шли ДВУМЯ
          отдельными строками с marginTop 6 и 7 — это давало лишний
          вертикальный вес и пустое место. Теперь оба вторичных действия
          живут в ОДНОМ ряду, и ряд рендерится только когда есть что
          показать. */}
      {isActive || showTranscriptAction || playError ? (
        <View style={s.secondaryRow}>
          {isActive ? (
            <TouchableOpacity
              onPress={onCycleRate}
              style={[s.ratePill, { borderColor: onSurface }]}
              accessibilityRole="button"
              testID="voice-rate-btn"
            >
              <Text style={[s.rateText, { color: iconColor }]}>{(state.rate || 1)}x</Text>
            </TouchableOpacity>
          ) : null}
          {showTranscriptAction ? (
            <TouchableOpacity
              onPress={onToggleTranscript}
              disabled={transcribing}
              style={s.transcriptBtn}
              accessibilityRole="button"
              testID="voice-transcript-toggle"
            >
              {transcribing ? (
                <ActivityIndicator size="small" color={timeColor} />
              ) : (
                <Feather name="align-left" size={12} color={timeColor} />
              )}
              <Text style={[s.transcriptBtnText, { color: timeColor }]} numberOfLines={1}>{transcriptAction}</Text>
            </TouchableOpacity>
          ) : null}
          {playError ? (
            <TouchableOpacity
              onPress={onToggle}
              style={s.retryBtn}
              accessibilityRole="button"
              testID="voice-play-retry"
            >
              <Feather name="rotate-ccw" size={12} color={accentColor} />
              <Text style={[s.retryText, { color: accentColor }]} numberOfLines={1}>{t('chat_attach_retry')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {transcriptVisible ? (
        <View style={[s.transcriptBox, { borderTopColor: onSurface }]} testID="voice-transcript">
          <Text style={[s.transcriptLabel, { color: timeColor }]}>{t('voice_original_label')}</Text>
          <Text style={[s.transcriptText, { color: textColor }]}>{transcript.transcriptText}</Text>
          {transcript.translatedText ? (
            <>
              <Text style={[s.transcriptLabel, { color: timeColor, marginTop: 8 }]}>{t('voice_translation_label')}</Text>
              <Text style={[s.transcriptText, { color: textColor }]}>{transcript.translatedText}</Text>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// §3 компактность: раньше wrap имел фиксированный minWidth: 172 — из-за
// этого секундное голосовое занимало столько же места, сколько минутное, и
// бабл выглядел визуально тяжёлым с пустотой внутри. Канон: короткое →
// компактно, длинное → шире, но без «половины экрана». Шкала растёт по
// длительности и жёстко ограничена сверху.
const COMPACT_MIN_WIDTH = 132;   // ~1-5 сек
const MEDIUM_MIN_WIDTH = 168;    // ~6-30 сек
const LONG_MIN_WIDTH = 196;      // 31+ сек (максимум)

export function voiceBubbleMinWidth(durationSec) {
  const sec = Math.max(0, Math.round(Number(durationSec) || 0));
  if (sec <= 5) return COMPACT_MIN_WIDTH;
  if (sec <= 30) return MEDIUM_MIN_WIDTH;
  return LONG_MIN_WIDTH;
}

const s = StyleSheet.create({
  wrap: { minWidth: COMPACT_MIN_WIDTH },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 30 },
  playBtn: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  // Полоса прогресса: увеличенная зона нажатия (44px по гайдлайнам), сама
  // полоса тонкая — визуально как в WhatsApp.
  trackHit: { flex: 1, minWidth: 64, height: 26, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, overflow: 'visible', position: 'relative' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2 },
  knob: { position: 'absolute', top: -3.5, width: 11, height: 11, borderRadius: 5.5, marginLeft: -5.5 },
  time: { fontSize: 11, fontWeight: '700', minWidth: 34, textAlign: 'right', fontVariant: ['tabular-nums'] },
  // Один ряд вторичных действий вместо двух строк — минус лишний
  // вертикальный вес; flexWrap спасает длинные ZH/KK подписи от обрезки.
  secondaryRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    columnGap: 10, rowGap: 4, marginTop: 5,
  },
  ratePill: {
    paddingHorizontal: 6, paddingVertical: 1.5,
    borderRadius: 8, borderWidth: 1,
  },
  rateText: { fontSize: 10.5, fontWeight: '900' },
  // Touch target сохранён (minHeight 22 + hitSlop у play), но визуальный вес
  // «В текст / 转文字» снижен: без своей строки и без лишнего marginTop.
  transcriptBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 22, flexShrink: 1 },
  transcriptBtnText: { fontSize: 11, fontWeight: '800' },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 22, flexShrink: 1 },
  retryText: { fontSize: 11, fontWeight: '800' },
  transcriptBox: { marginTop: 6, paddingTop: 7, borderTopWidth: 1 },
  transcriptLabel: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', marginBottom: 4 },
  transcriptText: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
});
