import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { v1Colors } from '../theme/designV1';
import { useToast } from '../components/Toast';
import { getTransactions, subscribe } from '../utils/store';
import { fetchRates } from '../utils/exchangeRates';
import GradientText from '../components/GradientText';

const CURRENCIES = ['USD', 'CNY', 'KZT', 'UZS', 'RUB', 'EUR', 'KGS', 'AED'];
const SYMBOLS = { USD: '$', CNY: '¥', KZT: '₸', UZS: 'сум', RUB: '₽', EUR: '€', KGS: 'с', AED: 'AED' };

const PAYMENT_METHODS = [
  { icon: '💳', name: 'Visa / MasterCard' },
  { icon: '📱', name: 'Kaspi · Payme · Click' },
  { icon: '💵', name: 'Cash via agent' },
];

const TYPE_ICONS = { deal_income: '💰', topup: '↑', contact_purchase: '👤', post_payment: '📦', unlimited_plan: '⭐' };

// Валюты для widget курсов (от USD)
const FX_PAIRS = ['KZT', 'CNY', 'UZS', 'RUB'];
const FX_FLAGS = { KZT: '🇰🇿', CNY: '🇨🇳', UZS: '🇺🇿', RUB: '🇷🇺' };

export default function WalletScreen({ route }) {
  const { role } = route.params || {};
  const accent = role === 'driver' ? '#22C55E' : '#F59E0B';
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const [currency, setCurrency] = useState('USD');
  const [premium, setPremium] = useState(false);
  const [transactions, setTransactions] = useState(getTransactions());
  const [fx, setFx] = useState(null);
  const [fxLoading, setFxLoading] = useState(true);

  useEffect(() => {
    const unsub = subscribe(() => setTransactions(getTransactions()));
    return () => unsub();
  }, []);

  useEffect(() => {
    (async () => {
      const r = await fetchRates();
      setFx(r);
      setFxLoading(false);
    })();
    // Обновление курсов раз в час
    const id = setInterval(async () => {
      const r = await fetchRates();
      setFx(r);
    }, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const conv = (usd) => {
    if (!fx) return usd;
    if (currency === 'USD') return usd;
    const rate = fx.rates[currency] || 1;
    const v = usd * rate;
    if (currency === 'UZS' || currency === 'KZT' || currency === 'RUB') return Math.round(v).toLocaleString();
    if (Math.abs(v) >= 100) return v.toFixed(0);
    return v.toFixed(2);
  };

  const lastUpdate = fx ? new Date(fx.fetchedAt) : null;
  const updateStr = lastUpdate
    ? `${String(lastUpdate.getHours()).padStart(2, '0')}:${String(lastUpdate.getMinutes()).padStart(2, '0')}`
    : '—';

  return (
    <SafeAreaView style={[s.container, { backgroundColor: v1Colors.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <GradientText style={s.title} colors={['#22C55E', '#16A34A']}>{t('wallet')}</GradientText>

        {/* Главная карточка баланса */}
        <View style={[s.balanceCard, { backgroundColor: theme.card, borderColor: accent + '30' }]}>
          <View style={s.betaBadge}><Text style={s.betaBadgeText}>🎉 {t('testPeriod')}</Text></View>
          <Text style={[s.balanceValue, { color: theme.text }]}>∞</Text>
          <Text style={[s.balanceNote, { color: theme.textMuted }]}>{t('allFree')}</Text>
        </View>

        {/* Premium */}
        <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={s.premiumRow}>
            <View>
              <Text style={[s.premiumTitle, { color: theme.text }]}>⭐ {t('premium')}</Text>
              <Text style={[s.premiumPrice, { color: theme.textMuted }]}><Text style={s.strike}>$20/mo</Text>  {t('allFree')}</Text>
            </View>
            <TouchableOpacity
              style={[s.premiumBtn, { backgroundColor: premium ? '#22C55E' : accent }]}
              onPress={() => { setPremium(true); toast(t('premiumActivated'), 'success'); }}
              disabled={premium}
            >
              <Text style={s.premiumBtnText}>{premium ? '✓ ' + t('active_') : t('activate')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 💱 Курсы валют (NEW — ниже Premium, выше способов оплаты) */}
        <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={s.fxHeader}>
            <Text style={[s.sectionTitle, { color: theme.textMuted }]}>💱 Курсы валют</Text>
            <Text style={[s.fxUpdate, { color: theme.textMuted }]}>
              {fxLoading ? '...' : `Обновлено ${updateStr}`}
            </Text>
          </View>
          {fxLoading ? (
            <ActivityIndicator color={accent} style={{ padding: 16 }} />
          ) : (
            <View style={s.fxGrid}>
              {FX_PAIRS.map(code => {
                const rate = fx?.rates[code] || 0;
                const formatted = code === 'UZS' || code === 'KZT' || code === 'RUB'
                  ? Math.round(rate).toLocaleString()
                  : rate.toFixed(2);
                return (
                  <View key={code} style={[s.fxCard, { borderColor: theme.border }]}>
                    <Text style={s.fxFlag}>{FX_FLAGS[code]}</Text>
                    <Text style={[s.fxPair, { color: theme.textMuted }]}>USD / {code}</Text>
                    <Text style={[s.fxRate, { color: theme.text }]}>{formatted}</Text>
                  </View>
                );
              })}
            </View>
          )}
          {fx?.source === 'fallback' && (
            <Text style={[s.fxFallback, { color: theme.textMuted }]}>⚠ Офлайн · кэшированные курсы</Text>
          )}
        </View>

        {/* Валюта отображения (перенесено под Курсы) */}
        <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.sectionTitle, { color: theme.textMuted }]}>{t('currency')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {CURRENCIES.map(c => (
              <TouchableOpacity
                key={c}
                style={[s.currencyBtn, { backgroundColor: theme.bg, borderColor: theme.border }, currency === c && { backgroundColor: accent, borderColor: accent }]}
                onPress={() => setCurrency(c)}
              >
                <Text style={[s.currencyText, { color: theme.textSecondary }, currency === c && { color: role === 'driver' ? '#fff' : '#0C0A09' }]}>{SYMBOLS[c]} {c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Способы оплаты */}
        <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.sectionTitle, { color: theme.textMuted }]}>{t('paymentSoon')}</Text>
          {PAYMENT_METHODS.map((m, i) => (
            <View key={m.name} style={[s.payRow, i < PAYMENT_METHODS.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
              <Text style={s.payIcon}>{m.icon}</Text>
              <Text style={[s.payName, { color: theme.textSecondary }]}>{m.name}</Text>
              <Text style={[s.paySoon, { color: theme.textMuted }]}>Soon</Text>
            </View>
          ))}
        </View>

        {/* История транзакций */}
        {transactions.length > 0 && (
          <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.sectionTitle, { color: theme.textMuted }]}>📊 История ({transactions.length})</Text>
            {transactions.map((tx, i) => (
              <View key={tx.id} style={[s.txRow, i < transactions.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                <View style={[s.txIcon, { backgroundColor: tx.amount > 0 ? '#22C55E20' : '#EF444420' }]}>
                  <Text style={{ fontSize: 16 }}>{TYPE_ICONS[tx.type] || '·'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.txDesc, { color: theme.text }]} numberOfLines={1}>{tx.desc}</Text>
                  <Text style={[s.txDate, { color: theme.textMuted }]}>{tx.date}</Text>
                </View>
                <Text style={[s.txAmount, { color: tx.amount > 0 ? '#22C55E' : '#EF4444' }]}>
                  {tx.amount > 0 ? '+' : ''}{SYMBOLS[currency]}{conv(Math.abs(tx.amount))}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 22, fontWeight: '900', marginBottom: 14 },
  balanceCard: { borderRadius: 20, padding: 28, borderWidth: 1, alignItems: 'center', marginBottom: 14 },
  betaBadge: { backgroundColor: '#22C55E15', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 12, marginBottom: 10 },
  betaBadgeText: { color: '#22C55E', fontSize: 12, fontWeight: '600' },
  balanceValue: { fontSize: 48, fontWeight: '900' },
  balanceNote: { fontSize: 12, marginTop: 4 },
  section: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 12 },
  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  currencyBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginTop: 10 },
  currencyText: { fontSize: 12, fontWeight: '700' },
  premiumRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  premiumTitle: { fontSize: 16, fontWeight: '700' },
  premiumPrice: { fontSize: 11, marginTop: 2 },
  strike: { textDecorationLine: 'line-through' },
  premiumBtn: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  premiumBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  fxHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  fxUpdate: { fontSize: 10, fontWeight: '600' },
  fxGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fxCard: { width: '47%', flexGrow: 1, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', gap: 4 },
  fxFlag: { fontSize: 22, marginBottom: 2 },
  fxPair: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  fxRate: { fontSize: 18, fontWeight: '900', marginTop: 2 },
  fxFallback: { fontSize: 10, textAlign: 'center', marginTop: 10 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  payIcon: { fontSize: 20 },
  payName: { flex: 1, fontSize: 13 },
  paySoon: { fontSize: 10, fontWeight: '600' },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  txIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  txDesc: { fontSize: 13, fontWeight: '600' },
  txDate: { fontSize: 10, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: '900' },
});
