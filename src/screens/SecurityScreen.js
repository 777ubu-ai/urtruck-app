import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { securityAPI, COLOR_UI } from '../utils/security';
import GradientText from '../components/GradientText';
import SecurityBadge from '../components/SecurityBadge';

export default function SecurityScreen({ navigation }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const { session } = useAuth();
  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const userId = session?.user?.id;
      if (userId) {
        const s = await securityAPI.getScore(userId);
        setScore(s);
      }
      setLoading(false);
    })();
  }, []);

  const ui = score?.color_code ? (COLOR_UI[score.color_code] || COLOR_UI.yellow) : COLOR_UI.yellow;

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[s.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.backText, { color: theme.text }]}>‹</Text>
          </TouchableOpacity>
          <GradientText style={s.title} colors={['#DC2626', '#F59E0B']}>🛡 Мой статус</GradientText>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#F59E0B" style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Мой скоринг — большая карточка */}
            <View style={[s.heroCard, { backgroundColor: theme.card, borderColor: ui.border }]}>
              <Text style={[s.heroScore, { color: ui.text }]}>
                {score?.total_score ?? 50}<Text style={s.heroMax}>/100</Text>
              </Text>
              <Text style={[s.heroLabel, { color: ui.text }]}>{ui.label}</Text>
              <Text style={[s.heroHint, { color: theme.textMuted }]}>
                Повышайте скоринг — завершайте сделки,{'\n'}
                получайте положительные отзывы
              </Text>
            </View>

            {/* Что улучшит скоринг */}
            <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[s.sectionTitle, { color: theme.textMuted }]}>📈 КАК ПОВЫСИТЬ</Text>
              {[
                { icon: '✅', title: 'Завершайте рейсы', desc: '+2 балла за каждый успешный рейс' },
                { icon: '⭐', title: 'Получайте отзывы 5★', desc: '+1 балл за положительный отзыв' },
                { icon: '📄', title: 'Верифицируйте документы', desc: '+10 баллов за подтверждение' },
                { icon: '🏦', title: 'Подтвердите счёт', desc: '+5 баллов за привязку банка' },
                { icon: '🤳', title: 'Биометрия', desc: '+10 баллов за Face ID верификацию' },
              ].map(item => (
                <View key={item.title} style={[s.tipRow, { borderBottomColor: theme.border }]}>
                  <Text style={{ fontSize: 20 }}>{item.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.tipTitle, { color: theme.text }]}>{item.title}</Text>
                    <Text style={[s.tipDesc, { color: theme.textMuted }]}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Чего избегать */}
            <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[s.sectionTitle, { color: theme.textMuted }]}>⚠ ЧЕГО ИЗБЕГАТЬ</Text>
              {[
                { icon: '❌', title: 'Отмены без причины', desc: '−5 баллов за отмену' },
                { icon: '📞', title: 'Игнорирование связи', desc: '−10 баллов если не отвечаете' },
                { icon: '⏰', title: 'Опоздания', desc: '−5 баллов за срыв срока' },
              ].map(item => (
                <View key={item.title} style={[s.tipRow, { borderBottomColor: theme.border }]}>
                  <Text style={{ fontSize: 20 }}>{item.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.tipTitle, { color: theme.text }]}>{item.title}</Text>
                    <Text style={[s.tipDesc, { color: theme.textMuted }]}>{item.desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Политика конфиденциальности */}
            <View style={[s.privacyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={{ fontSize: 24 }}>🔒</Text>
              <Text style={[s.privacyTitle, { color: theme.text }]}>Ваши данные защищены</Text>
              <Text style={[s.privacyDesc, { color: theme.textMuted }]}>
                Все проверки выполняются автоматически. Мы не делимся вашими персональными данными
                с третьими лицами. Скоринг обновляется раз в месяц.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  backBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  backText: { fontSize: 22 },
  title: { fontSize: 22, fontWeight: '900' },
  heroCard: { padding: 28, borderRadius: 20, borderWidth: 2, alignItems: 'center', marginBottom: 14, gap: 6 },
  heroScore: { fontSize: 64, fontWeight: '900', letterSpacing: -2 },
  heroMax: { fontSize: 22, opacity: 0.5, fontWeight: '700' },
  heroLabel: { fontSize: 16, fontWeight: '800' },
  heroHint: { fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 10 },
  section: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 12 },
  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  tipTitle: { fontSize: 13, fontWeight: '700' },
  tipDesc: { fontSize: 11, marginTop: 2 },
  privacyCard: { padding: 20, borderRadius: 16, borderWidth: 1, alignItems: 'center', gap: 6, marginTop: 4 },
  privacyTitle: { fontSize: 14, fontWeight: '800' },
  privacyDesc: { fontSize: 11, textAlign: 'center', lineHeight: 17 },
});
