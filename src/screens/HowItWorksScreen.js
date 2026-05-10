import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';
import { useToast } from '../components/Toast';
import {v1Colors, useV1Colors} from '../theme/designV1';
import { accentColors } from '../utils/theme';

const SUPPORT_TG = 'https://t.me/UrTruckSupport';
const SUPPORT_EMAIL = 'hello@urtruck.kz';

const STEPS_CLIENT = [
  {
    n: 1, icon: '📝',
    title: 'Опубликуй груз',
    body: 'Откуда, куда, что везти, желаемая цена. Публикация бесплатна. Займёт минуту.',
  },
  {
    n: 2, icon: '💬',
    title: 'Получи предложения',
    body: 'Проверенные водители откликнутся с ценами. Выбирай лучшего — смотри рейтинг, отзывы, безопасность.',
  },
  {
    n: 3, icon: '🚛',
    title: 'Отслеживай рейс',
    body: 'Водитель везёт твой груз. Видишь статус на карте: принят, в пути, доставлен.',
  },
  {
    n: 4, icon: '⭐',
    title: 'Оцени и плати',
    body: 'После доставки поставь звёзды и расплатись удобным способом. Всё прозрачно.',
  },
];

const STEPS_DRIVER = [
  {
    n: 1, icon: '📱',
    title: 'Зарегистрируйся за 2 минуты',
    body: 'WhatsApp-код → селфи → фото прав и техпаспорта. Модерация до 1 часа.',
  },
  {
    n: 2, icon: '📦',
    title: 'Смотри грузы по маршруту',
    body: 'Ты видишь актуальные заявки. Фильтр по типу кузова, цене, городам.',
  },
  {
    n: 3, icon: '🤝',
    title: 'Откликнись и договаривайся',
    body: 'Предложи свою цену. Клиент видит твой рейтинг и сам примет решение.',
  },
  {
    n: 4, icon: '💰',
    title: 'Вези и получай',
    body: 'После подтверждения доставки — получаешь оплату. Репутация растёт.',
  },
];

const FEATURES = [
  { icon: '🛡️', t: 'Безопасность', d: 'Каждый водитель проходит проверку: ИИН, документы, Liveness, blacklist, OCR.' },
  { icon: '💯', t: 'Без посредников', d: 'Связь напрямую между клиентом и водителем. Мы не берём процент за каждый рейс.' },
  { icon: '⚡', t: 'Быстрый просмотр', d: 'Смотри ленту без регистрации. Регистрируйся только когда готов действовать.' },
  { icon: '🌍', t: 'Китай ↔ СНГ', d: 'Специализация на FTL-перевозках от Урумчи до Москвы. 11 языков, 6 стран.' },
];


export default function HowItWorksScreen({ navigation, route }) {
  const v1 = useV1Colors();
  const { theme, isDark } = useTheme();
  const { t } = useI18n();
  const { toast } = useToast();
  const role = route?.params?.role || 'client';
  const steps = role === 'driver' ? STEPS_DRIVER : STEPS_CLIENT;
  const accent = role === 'driver' ? accentColors.driver : accentColors.client;

  const openSupport = (url) => {
    Linking.openURL(url).catch(() => {
      toast(t('share_open_failed') || t('generic_error') || 'Не удалось открыть', 'error');
    });
  };

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: v1.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
          <Text style={[s.backText, { color: theme.text }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>Как это работает</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Role toggle */}
        <View style={[s.roleToggle, { backgroundColor: theme.card }]}>
          <TouchableOpacity
            style={[s.roleTab, role === 'client' && { backgroundColor: accentColors.client }]}
            onPress={() => navigation.setParams({ role: 'client' })}
          >
            <Text style={[s.roleTabText, { color: role === 'client' ? '#FFF' : theme.textMuted }]}>📦 Для клиента</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.roleTab, role === 'driver' && { backgroundColor: accentColors.driver }]}
            onPress={() => navigation.setParams({ role: 'driver' })}
          >
            <Text style={[s.roleTabText, { color: role === 'driver' ? '#FFF' : theme.textMuted }]}>🚛 Для водителя</Text>
          </TouchableOpacity>
        </View>

        <Text style={[s.sectionTitle, { color: theme.text }]}>4 простых шага</Text>

        {steps.map((st, i) => (
          <View key={st.n} style={s.step}>
            <View style={[s.stepNum, { backgroundColor: accent }]}>
              <Text style={s.stepNumText}>{st.n}</Text>
            </View>
            {i < steps.length - 1 && <View style={[s.stepLine, { backgroundColor: theme.border }]} />}
            <View style={[s.stepCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View style={s.stepHead}>
                <Text style={s.stepIcon}>{st.icon}</Text>
                <Text style={[s.stepTitle, { color: theme.text }]}>{st.title}</Text>
              </View>
              <Text style={[s.stepBody, { color: theme.textSecondary }]}>{st.body}</Text>
            </View>
          </View>
        ))}

        <Text style={[s.sectionTitle, { color: theme.text, marginTop: 24 }]}>Почему UrTruck</Text>
        {FEATURES.map((f, i) => (
          <View key={i} style={[s.feature, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={s.featureIcon}>{f.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.featureTitle, { color: theme.text }]}>{f.t}</Text>
              <Text style={[s.featureBody, { color: theme.textMuted }]}>{f.d}</Text>
            </View>
          </View>
        ))}

        <View style={[s.faq, { backgroundColor: `${accent}10`, borderColor: accent }]}>
          <Text style={[s.faqTitle, { color: accent }]}>❓ {t('support_questions_title') || 'Остались вопросы?'}</Text>
          <Text style={[s.faqBody, { color: theme.text }]}>
            {t('support_questions_body') || 'Напиши в поддержку — отвечаем в рабочее время.'}
          </Text>
          <View style={s.supportRow}>
            <TouchableOpacity
              style={[s.supportBtn, { backgroundColor: accent }]}
              onPress={() => openSupport(SUPPORT_TG)}
              testID="support-telegram"
              accessibilityRole="button"
              accessibilityLabel="Telegram"
            >
              <Text style={s.supportBtnText}>💬 Telegram</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.supportBtn, { borderWidth: 1, borderColor: accent, backgroundColor: 'transparent' }]}
              onPress={() => openSupport(`mailto:${SUPPORT_EMAIL}`)}
              testID="support-email"
              accessibilityRole="button"
              accessibilityLabel="Email"
            >
              <Text style={[s.supportBtnText, { color: accent }]}>✉ Email</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 30, fontWeight: '300' },
  headerTitle: { fontSize: 17, fontWeight: '800' },

  roleToggle: { flexDirection: 'row', padding: 4, borderRadius: 14, marginBottom: 18, gap: 4 },
  roleTab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  roleTabText: { fontSize: 13, fontWeight: '700' },

  sectionTitle: { fontSize: 20, fontWeight: '800', marginBottom: 14, marginTop: 8 },

  step: { flexDirection: 'row', gap: 12, marginBottom: 14, position: 'relative' },
  stepNum: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', zIndex: 2,
  },
  stepNumText: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  stepLine: {
    position: 'absolute', left: 16, top: 34, bottom: -14, width: 2,
    zIndex: 1,
  },
  stepCard: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  stepIcon: { fontSize: 22 },
  stepTitle: { flex: 1, fontSize: 15, fontWeight: '800' },
  stepBody: { fontSize: 13, lineHeight: 18 },

  feature: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 10,
  },
  featureIcon: { fontSize: 26 },
  featureTitle: { fontSize: 14, fontWeight: '800', marginBottom: 3 },
  featureBody: { fontSize: 12, lineHeight: 17 },

  faq: {
    marginTop: 18, padding: 16, borderRadius: 14, borderWidth: 1.5,
  },
  faqTitle: { fontSize: 15, fontWeight: '800', marginBottom: 6 },
  faqBody: { fontSize: 13, lineHeight: 19 },
  supportRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  supportBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  supportBtnText: { color: '#0A0A0A', fontSize: 14, fontWeight: '800' },
});
