import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { voice } from "../../utils/voiceRecorder";

const RATES = [1, 1.5, 2];

export default function VoiceMessageBubble({
  item,
  mine,
  colors,
  t,
  transcript,
  transcribing,
  onToggleTranscript,
}) {
  const [playing, setPlaying] = React.useState(false);
  const [rate, setRate] = React.useState(1);

  const togglePlayback = async () => {
    if (!item?.mediaUrl && !item?.voiceUrl) return;
    if (playing) {
      await voice.stop();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    const ok = await voice.play(item.mediaUrl || item.voiceUrl, rate);
    setPlaying(false);
    if (!ok) return;
  };

  const cycleRate = async () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    if (playing) await voice.setRate(next);
  };

  const textVisible = !!transcript?.visible && !!transcript?.transcriptText;
  const actionLabel = transcribing
    ? "..."
    : textVisible
      ? t("voice_hide_text")
      : transcript?.transcriptText
        ? t("voice_show_text")
        : t("voice_to_text");
  const foreground = mine ? "#111B21" : colors.text;
  const muted = mine ? "rgba(17,27,33,0.58)" : colors.textMuted;

  return (
    <View style={s.root}>
      <View style={s.playerRow}>
        <TouchableOpacity onPress={togglePlayback} style={s.playButton} accessibilityRole="button">
          <Feather name={playing ? "pause" : "play"} size={18} color={foreground} />
        </TouchableOpacity>
        <View style={s.waveform}>
          {[3, 6, 10, 7, 13, 8, 15, 9, 12, 6, 11, 7, 14, 8, 5].map((height, index) => (
            <View key={index} style={[s.wave, { height, backgroundColor: mine ? "rgba(17,27,33,0.42)" : colors.textMuted }]} />
          ))}
        </View>
        <Text style={[s.duration, { color: foreground }]}>
          {item?.voiceDuration || item?.duration ? `${item.voiceDuration || item.duration}${t("unit_sec_short")}` : "—"}
        </Text>
        <TouchableOpacity onPress={cycleRate} style={[s.rateButton, { borderColor: mine ? "rgba(17,27,33,0.2)" : colors.border }]} accessibilityLabel={`speed-${rate}`}>
          <Text style={[s.rateText, { color: foreground }]}>{rate}x</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={s.translateButton} onPress={onToggleTranscript} disabled={transcribing}>
        <Feather name="align-left" size={12} color={muted} />
        <Text style={[s.translateText, { color: muted }]}>{actionLabel}</Text>
      </TouchableOpacity>
      {textVisible ? (
        <View style={[s.transcript, { borderTopColor: mine ? "rgba(17,27,33,0.16)" : colors.border }]}>
          <Text style={[s.label, { color: muted }]}>{t("voice_original_label")}</Text>
          <Text style={[s.text, { color: foreground }]}>{transcript.transcriptText}</Text>
          {transcript.translatedText ? (
            <>
              <Text style={[s.label, { color: muted, marginTop: 8 }]}>{t("voice_translation_label")}</Text>
              <Text style={[s.text, { color: foreground }]}>{transcript.translatedText}</Text>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  root: { minWidth: 220 },
  playerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  playButton: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(17,27,33,0.18)" },
  waveform: { flex: 1, height: 24, flexDirection: "row", alignItems: "center", gap: 2 },
  wave: { width: 3, borderRadius: 2 },
  duration: { fontSize: 11, minWidth: 28, textAlign: "right" },
  rateButton: { minWidth: 34, height: 26, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  rateText: { fontSize: 11, fontWeight: "800" },
  translateButton: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  translateText: { fontSize: 11, fontWeight: "700" },
  transcript: { marginTop: 7, paddingTop: 7, borderTopWidth: 1 },
  label: { fontSize: 10, fontWeight: "800", textTransform: "uppercase", marginBottom: 3 },
  text: { fontSize: 12, lineHeight: 17 },
});
