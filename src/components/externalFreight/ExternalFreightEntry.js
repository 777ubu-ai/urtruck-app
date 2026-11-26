import React, { useEffect, useRef, useState } from 'react';
import { AppState, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors, useDriverCeramicColors } from '../../theme/designV1';
import { useI18n } from '../../utils/useI18n';
import { useAuth } from '../../utils/AuthContext';
import { sessionRole } from '../../utils/externalFreightSession';
import { EXTERNAL_FREIGHT_ENABLED, externalFreightAPI } from '../../utils/externalFreightFeed';
import { storage } from '../../utils/storage';

const COUNT_STORAGE_KEY = 'ur_external_feed_count_v1';
const COUNT_MAX_AGE_MS = 5 * 60_000;
const COUNT_MIN_REFRESH_MS = 30_000;

function validCount(value, ownerKey) {
  return value?.ownerKey === ownerKey && Number.isSafeInteger(value.count) && value.count >= 0
    && Date.now() >= value.fetchedAt && Date.now() - value.fetchedAt < COUNT_MAX_AGE_MS;
}

// Основная шапка не изменяется: у ленты только отдельная кнопка входа.
export default function ExternalFreightEntry(props) {
  const { navigation, role, ceramic, showBack, children } = props;
  const colors = useV1Colors();
  const ceramicColors = useDriverCeramicColors();
  const { lang } = useI18n();
  const { session } = useAuth();
  const enabled = EXTERNAL_FREIGHT_ENABLED && !showBack && ['driver', 'client'].includes(role);
  const currentRole = sessionRole(session);
  const ownerKey = `${session?.user?.id || ''}:${role}:${currentRole || ''}`;
  const ownerRef = useRef(ownerKey);
  ownerRef.current = ownerKey;
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!enabled || !session?.user?.id || currentRole !== role) return undefined;
    let alive = true, controller = null, timeout = null, lastSuccess = 0;
    const current = () => alive && ownerRef.current === ownerKey;
    const cancel = () => { controller?.abort(); controller = null; clearTimeout(timeout); };
    storage.get(COUNT_STORAGE_KEY).then(raw => {
      if (!current() || !raw) return;
      const cached = JSON.parse(raw);
      if (validCount(cached, ownerKey)) setResult(previous => validCount(previous, ownerKey) ? previous : cached);
    }).catch(() => {});
    const refresh = async () => {
      if (!current() || !navigation.isFocused() || AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
      if (controller || Date.now() - lastSuccess < COUNT_MIN_REFRESH_MS) return;
      setResult(previous => validCount(previous, ownerKey) ? previous : null);
      const request = new AbortController();
      controller = request;
      timeout = setTimeout(cancel, 8000);
      try {
        const data = await externalFreightAPI.count(request.signal, () => current() && !request.signal.aborted);
        if (!current() || request.signal.aborted) return;
        const kind = role === 'driver' ? 'cargo' : 'vehicle';
        const next = { ownerKey, count: data.count, fetchedAt: Date.now() };
        if (data.ok && data.kind === kind && validCount(next, ownerKey)) {
          lastSuccess = next.fetchedAt;
          setResult(next);
          void storage.set(COUNT_STORAGE_KEY, JSON.stringify(next));
        }
      } catch {
        // При сетевой ошибке продолжаем показывать последнее число до истечения срока.
      } finally {
        if (controller === request) cancel();
      }
    };
    const onBlur = cancel;
    const removeFocus = navigation.addListener('focus', refresh);
    const removeBlur = navigation.addListener('blur', onBlur);
    const appListener = AppState.addEventListener('change', state => state === 'active' ? refresh() : onBlur());
    const interval = setInterval(refresh, 60000);
    refresh();
    return () => { alive = false; cancel(); clearInterval(interval); removeFocus(); removeBlur(); appListener.remove(); };
  }, [enabled, ownerKey, role, navigation, session?.user?.id, currentRole]);
  if (!EXTERNAL_FREIGHT_ENABLED || showBack || !['driver', 'client'].includes(role)) return children;
  const labels = {
    RU: role === 'driver' ? 'Лента грузов' : 'Лента машин',
    KK: role === 'driver' ? 'Жүк лентасы' : 'Көлік лентасы',
    ZH: role === 'driver' ? '货源信息' : '车辆信息',
    EN: role === 'driver' ? 'Cargo feed' : 'Truck feed',
  };
  const palette = ceramic ? ceramicColors : colors;
  const count = enabled && currentRole === role && validCount(result, ownerKey) ? result.count : null;
  const countText = count === null ? null : String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const label = labels[lang] || labels.EN;
  return <View>
    {children}
    <View style={styles.entrySlot} pointerEvents="box-none">
      <TouchableOpacity testID="external-freight-entry" accessibilityRole="button" accessibilityLabel={countText === null ? label : `${label}, ${countText}`}
        onPress={() => navigation.navigate('ExternalFreightFeed')}
        style={[styles.entry, { backgroundColor: colors.driverSoft, borderColor: palette.border }]}>
        <Feather name="list" size={15} color={palette.text} />
        <Text numberOfLines={1} style={[styles.label, { color: palette.text }]}>{label}</Text>
        {countText !== null && <Text testID="external-freight-count" numberOfLines={1}
          style={[styles.count, { color: palette.text, backgroundColor: palette.surface }]}>{countText}</Text>}
      </TouchableOpacity>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  entrySlot: { position: 'absolute', left: 16, right: 80, top: 0, bottom: 0, justifyContent: 'center' },
  entry: { alignSelf: 'flex-start', maxWidth: '100%', minHeight: 44, borderRadius: 22, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  label: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  count: { fontSize: 12, fontWeight: '700', flexShrink: 0, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 3, fontVariant: ['tabular-nums'] },
});
