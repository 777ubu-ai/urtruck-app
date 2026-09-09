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
import { useTheme } from '../utils/ThemeContext';
import { useV1Colors, getBubbleColors, withAlpha } from '../theme/designV1';

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
  // Цвета по умолчанию берутся из токенов (getBubbleColors для своего
  // бабла, accent/textMuted чужого) — пропы оставлены для совместимости.
  textColor,
  mutedColor,
  accentColor,
  onError,
  transcript,
  transcribing = false,
  onToggleTranscript,
  t = (key) => key,
  testID = 'voice-bubble',
  // QA-only (DesignPreviewScreen): показать пилюлю скорости/активное
  // состояние без реального воспроизведения. Playback-логику не трогает.
  forceActive = false,
}) {
  const { isDark } = useTheme();
  const palette = useV1Colors();
  const bubble = getBubbleColors(mine, !!isDark);
  const baseText = textColor || (mine ? bubble.textColor : palette.text);
  const baseMuted = mutedColor || (mine ? withAlpha(bubble.textColor, 0.68) : palette.textMuted);
  const baseAccent = accentColor || (mine ? bubble.textColor : (isDark ? palette.success : palette.driver));
  const [state, setState] = React.useState(() => voice.getState?.() || {
    uri: null, isPlaying: false, positionMillis: 0, durationMillis: 0, rate: 1,
  });
  const [trackWidth, setTrackWidth] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    const unsub = voice.subscribe?.((next) => setState(next));
    return () => { try { unsub?.(); } catch {} };
  }, []);

  // Этот бабл активен только если плеер играет ИМЕННО его трек
  // (forceActive — QA-only предпросмотр активного состояния).
  const isActive = forceActive || (!!uri && state.uri === uri);
  const isPlaying = isActive && !!state.isPlaying;
  const durationMs = (isActive && state.durationMillis)
    ? state.durationMillis
    : Math.round((fallbackDurationSec || 0) * 1000);
  const positionMs = isActive ? (state.positionMillis || 0) : 0;
  const progress = durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0;

  const onToggle = React.useCallback(async () => {
    if (!uri || busy) return;
    setBusy(true);
    try {
      const ok = await voice.toggle(uri);
      if (!ok && !isActive) onError?.();
    } finally {
      setBusy(false);
    }
  }, [uri, busy, isActive, onError]);

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

  const onSurface = mine ? withAlpha(bubble.textColor, 0.26) : withAlpha(baseAccent, 0.18);
  const fillColor = mine ? bubble.textColor : baseAccent;
  const iconColor = mine ? bubble.textColor : baseAccent;
  const timeColor = mine ? bubble.textColor : baseMuted;
  const rateColor = mine ? withAlpha(bubble.textColor, 0.78) : baseAccent;
  const dividerColor = mine ? withAlpha(bubble.textColor, 0.24) : palette.border;
  const textVisible = !!transcript?.visible && !!transcript?.transcriptText;
  const transcriptLabel = transcribing ? '…' : textVisible ? t('voice_hide_text') : transcript?.transcriptText ? t('voice_show_text') : t('voice_to_text');

  return (
    <View style={s.wrap} testID={testID}>
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
            : <Feather name={isPlaying ? 'pause' : 'play'} size={17} color={iconColor} />}
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

      {isActive ? (
        <TouchableOpacity
          onPress={onCycleRate}
          style={[s.ratePill, { borderColor: onSurface }]}
          accessibilityRole="button"
          testID="voice-rate-btn"
        >
          <Text style={[s.rateText, { color: rateColor }]}>{(state.rate || 1)}x</Text>
        </TouchableOpacity>
      ) : null}
      {onToggleTranscript ? (
        <TouchableOpacity onPress={onToggleTranscript} disabled={transcribing} style={s.transcriptButton} accessibilityRole="button" testID="voice-transcription-btn">
          <Feather name="align-left" size={12} color={baseMuted} />
          {transcribing ? <ActivityIndicator size="small" color={baseMuted} testID="voice-transcription-loading" /> : null}
          <Text style={[s.transcriptLabel, { color: baseMuted }]}>{transcriptLabel}</Text>
        </TouchableOpacity>
      ) : null}
      {textVisible ? <View style={[s.transcriptDivider, { backgroundColor: dividerColor }]} testID="voice-transcription-divider" /> : null}
      {textVisible ? <Text style={[s.transcriptText, { color: baseText }]}>{transcript.transcriptText}</Text> : null}
      {transcript?.errorText ? <Text style={[s.transcriptError, { color: baseMuted }]} testID="voice-transcription-error">{transcript.errorText}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { minWidth: 172 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 36 },
  playBtn: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  // Полоса прогресса: зона нажатия 44px (guidelines), сама
  // полоса тонкая — визуально как в WhatsApp.
  trackHit: { flex: 1, minWidth: 64, height: 44, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, overflow: 'visible', position: 'relative' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2 },
  knob: { position: 'absolute', top: -3.5, width: 11, height: 11, borderRadius: 5.5, marginLeft: -5.5 },
  time: { fontSize: 12, fontWeight: '700', minWidth: 36, textAlign: 'right', fontVariant: ['tabular-nums'] },
  ratePill: {
    alignSelf: 'flex-start', marginTop: 6, minHeight: 22,
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  rateText: { fontSize: 12, fontWeight: '700' },
  transcriptButton: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  transcriptLabel: { fontSize: 11, fontWeight: '700' },
  // Разделитель над блоком расшифровки (регрессия против legacy-чата,
  // где визуальной границы между «В текст» и текстом не было).
  transcriptDivider: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginTop: 4, marginBottom: 2 },
  transcriptText: { marginTop: 2, fontSize: 13, lineHeight: 18 },
  transcriptError: { marginTop: 3, fontSize: 12, lineHeight: 16 },
});
