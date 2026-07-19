import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';
import { useV1Colors } from '../theme/designV1';
import { API_BASE } from '../config/env';
import { storage } from '../utils/storage';

const BASE = `${API_BASE}/borders`;

// Статус строки очереди: цвет + i18n-ключ. Синхронизирован с QueueScreen
// (BOARD_STATUS / LOOKUP_STATUS_KEY) и с макетом «Мои номера в очереди».
const ST = {
  in_queue: { key: 'queue_lk_in_queue', color: '#2563EB' },
  called:   { key: 'queue_lk_called',   color: '#FF8400' },
  crossed:  { key: 'queue_lk_crossed',  color: '#22C55E' },
  revoked:  { key: 'queue_lk_revoked',  color: '#EF4444' },
};

export default function TrackedPlatesScreen({ navigation }) {
  const v1 = useV1Colors();
  const { theme } = useTheme();
  const { t } = useI18n();
  const driver = v1.driver || '#00E676';

  const [token, setToken] = useState(undefined);   // undefined=loading, null=guest
  const [items, setItems] = useState([]);          // [{plate, status, checkpoint, queue_datetime, is_late, updated_at}]
  const [loading, setLoading] = useState(true);
  const [newPlate, setNewPlate] = useState('');
  const [adding, setAdding] = useState(false);

  // Тянем список watch'ей + свежий статус каждого номера (пункт пропуска,
  // время) — /watch хранит только last_status, поэтому обогащаем из /lookup.
  const load = useCallback(async (tok, { silent = false } = {}) => {
    if (!tok) { setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      const r = await fetch(`${BASE}/watch`, { headers: { Authorization: `Bearer ${tok}` } });
      const d = await r.json();
      const watches = Array.isArray(d.watches) ? d.watches : [];
      const enriched = await Promise.all(watches.map(async (w) => {
        let live = {};
        try {
          const lr = await fetch(`${BASE}/lookup?plate=${encodeURIComponent(w.plate)}`);
          const ld = await lr.json();
          if (ld && ld.found) live = ld;
        } catch { /* оффлайн — покажем last_status из watch */ }
        return {
          plate: w.plate,
          status: live.status || w.last_status || null,
          checkpoint: live.checkpoint || null,
          queue_datetime: live.queue_datetime || null,
          is_late: !!live.is_late,
          updated_at: w.updated_at || null,
        };
      }));
      setItems(enriched);
    } catch {
      /* сеть недоступна — оставляем что было */
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const tok = await storage.get('ur_reg_token').catch(() => null);
      setToken(tok || null);
      load(tok);
    })();
  }, [load]);

  // Живое обновление при возврате на экран (тихо).
  useFocusEffect(
    useCallback(() => {
      if (token) load(token, { silent: true });
    }, [token, load])
  );

  const add = async () => {
    const p = newPlate.trim();
    if (p.length < 3 || adding || !token) return;
    setAdding(true);
    try {
      await fetch(`${BASE}/watch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plate: p }),
      });
      setNewPlate('');
      await load(token);
    } catch { /* no-op */ }
    finally { setAdding(false); }
  };

  const remove = async (plate) => {
    setItems((prev) => prev.filter((x) => x.plate !== plate));  // оптимистично
    if (!token) return;
    try {
      await fetch(`${BASE}/watch?plate=${encodeURIComponent(plate)}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* no-op */ }
  };

  const Header = (
    <View style={s.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={s.back} testID="tracked-back">
        <Text style={[s.backText, { color: theme.text }]}>‹</Text>
      </TouchableOpacity>
      <Text style={[s.headerTitle, { color: theme.text }]} testID="tracked-title">{t('tracked_title')}</Text>
      <View style={{ width: 44 }} />
    </View>
  );

  // Гость (нет токена) — мягкий призыв войти. Watch привязан к user_id.
  if (token === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: v1.bg }} edges={['top']}>
        {Header}
        <View style={s.guestWrap}>
          <Text style={s.guestIcon}>🚛</Text>
          <Text style={[s.guestText, { color: theme.textMuted }]}>{t('tracked_need_reg')}</Text>
          <TouchableOpacity
            style={[s.primary, { backgroundColor: driver }]}
            onPress={() => navigation.navigate('Citizenship')}
            testID="tracked-signin"
          >
            <Text style={[s.primaryText, { color: v1.driverOnAccent || '#0C0A09' }]}>{t('login_action')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: v1.bg }} edges={['top']}>
      {Header}
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(token)} tintColor={driver} />}
      >
        <Text style={[s.subtitle, { color: theme.textMuted }]}>{t('tracked_subtitle')}</Text>
        <View style={[s.live, { borderColor: driver + '48', backgroundColor: driver + '1A' }]}>
          <View style={[s.dot, { backgroundColor: driver }]} />
          <Text style={[s.liveText, { color: driver }]}>{t('tracked_live')}</Text>
        </View>

        {loading && items.length === 0 ? (
          <ActivityIndicator color={driver} style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <Text style={[s.empty, { color: theme.textMuted }]}>{t('tracked_empty')}</Text>
        ) : (
          items.map((it) => {
            const st = ST[it.status];
            const col = st ? st.color : '#78716C';
            const called = it.status === 'called';
            return (
              <View
                key={it.plate}
                style={[s.card, {
                  backgroundColor: theme.card, borderColor: called ? col + '73' : theme.border,
                  borderLeftColor: col, borderLeftWidth: 4,
                }]}
                testID="tracked-card"
              >
                <View style={s.cardTop}>
                  <Text style={[s.plate, { color: theme.text }]} numberOfLines={1}>{it.plate}</Text>
                  <View style={[s.badge, { backgroundColor: col + '26', borderColor: col + '80' }]}>
                    <Text style={[s.badgeText, { color: col }]} numberOfLines={1}>
                      {st ? t(st.key) : t('queue_lk_unknown')}{it.is_late ? ' ⏱' : ''}
                    </Text>
                  </View>
                </View>

                {it.checkpoint ? (
                  <Text style={[s.meta, { color: theme.textMuted }]} numberOfLines={1}>
                    <Text style={{ color: theme.text, fontWeight: '700' }}>{it.checkpoint}</Text>
                    {it.queue_datetime ? ` · ${it.queue_datetime}` : ''}
                  </Text>
                ) : null}

                {called ? (
                  <View style={[s.callMsg, { backgroundColor: col + '1A', borderColor: col + '4D' }]}>
                    <Text style={[s.callMsgText, { color: '#FCD34D' }]}>🚛 {t('queue_lk_called')}</Text>
                  </View>
                ) : null}

                <View style={s.foot}>
                  <Text style={[s.pushOn, { color: driver }]}>🔔 {t('tracked_push_on')}</Text>
                  <TouchableOpacity onPress={() => remove(it.plate)} style={[s.stop, { borderColor: theme.border }]} testID="tracked-stop">
                    <Text style={[s.stopText, { color: theme.textMuted }]}>{t('tracked_stop')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        {/* Добавить номер */}
        <View style={[s.addBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.addLabel, { color: theme.text }]}>＋ {t('tracked_add_label')}</Text>
          <Text style={[s.addHint, { color: theme.textMuted }]}>{t('tracked_add_hint')}</Text>
          <View style={s.addRow}>
            <TextInput
              style={[s.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
              value={newPlate}
              onChangeText={setNewPlate}
              placeholder={t('queue_my_plate_placeholder')}
              placeholderTextColor={theme.textDim}
              autoCapitalize="characters"
              autoCorrect={false}
              onSubmitEditing={add}
              returnKeyType="done"
              testID="tracked-plate-input"
            />
            <TouchableOpacity
              style={[s.addBtn, { backgroundColor: driver }]}
              onPress={add}
              disabled={adding || newPlate.trim().length < 3}
              testID="tracked-add"
            >
              {adding
                ? <ActivityIndicator color={v1.driverOnAccent || '#0C0A09'} />
                : <Text style={[s.addBtnText, { color: v1.driverOnAccent || '#0C0A09' }]}>{t('tracked_add_btn')}</Text>}
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
  subtitle: { fontSize: 13.5, lineHeight: 19, marginTop: 4 },
  live: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5, marginTop: 12, marginBottom: 4,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  empty: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 36, marginBottom: 8, paddingHorizontal: 12 },
  card: { borderRadius: 16, padding: 14, borderWidth: 1, marginTop: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  plate: { flex: 1, fontSize: 19, fontWeight: '900', letterSpacing: 0.5 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, maxWidth: '52%' },
  badgeText: { fontSize: 11.5, fontWeight: '800' },
  meta: { fontSize: 13, marginTop: 10 },
  callMsg: { marginTop: 11, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  callMsgText: { fontSize: 13, fontWeight: '700' },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13 },
  pushOn: { fontSize: 12, fontWeight: '800' },
  stop: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 7 },
  stopText: { fontSize: 12.5, fontWeight: '700' },
  addBox: { marginTop: 16, borderRadius: 16, borderWidth: 1, padding: 14 },
  addLabel: { fontSize: 15, fontWeight: '800' },
  addHint: { fontSize: 12.5, marginTop: 3, marginBottom: 12 },
  addRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, height: 46, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 15, fontWeight: '700' },
  addBtn: { height: 46, paddingHorizontal: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addBtnText: { fontSize: 14.5, fontWeight: '800' },
  guestWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  guestIcon: { fontSize: 48, marginBottom: 16 },
  guestText: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  primary: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, minWidth: 220 },
  primaryText: { fontSize: 16, fontWeight: '800' },
});
