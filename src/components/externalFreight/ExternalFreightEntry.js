import { withAdditionalLanguageTree, } from '../../utils/additionalLocales.js';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors, useDriverCeramicColors } from '../../theme/designV1';
import { useI18n } from '../../utils/useI18n';
import { useAuth } from '../../utils/AuthContext';
import { sessionRole } from '../../utils/externalFreightSession';
import { EXTERNAL_FREIGHT_ENABLED, externalFreightAPI } from '../../utils/externalFreightFeed';

// Основная шапка не изменяется: у ленты только отдельная кнопка входа.
export default function ExternalFreightEntry(props) {
  const { navigation, role, ceramic, showBack, children } = props;
  const colors = useV1Colors();
  const ceramicColors = useDriverCeramicColors();
  const { lang, t } = useI18n();
  const { session } = useAuth();
  const enabled = EXTERNAL_FREIGHT_ENABLED && !showBack && ['driver', 'client'].includes(role);
  const currentRole = sessionRole(session);
  const ownerKey = `${session?.user?.id || ''}:${role}:${currentRole || ''}`;
  const ownerRef = useRef(ownerKey);
  ownerRef.current = ownerKey;
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!enabled || !session?.user?.id || currentRole !== role) return undefined;
    let alive = true, controller = null, timeout = null;
    const current = () => alive && ownerRef.current === ownerKey;
    const cancel = () => {
      const request = controller;
      controller = null;
      clearTimeout(timeout);
      timeout = null;
      request?.abort();
    };
    const refresh = async () => {
      if (!current() || controller || !navigation.isFocused() || AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
      const request = new AbortController();
      controller = request;
      const requestTimeout = setTimeout(() => request.abort(), 8000);
      timeout = requestTimeout;
      try {
        const data = await externalFreightAPI.count(request.signal, () => current() && !request.signal.aborted);
        if (!current() || request.signal.aborted) return;
        const kind = role === 'driver' ? 'cargo' : 'vehicle';
        // Счётчик объединённой выдачи включает и предложения, и контакты.
        const count = data.count;
        if (data.ok && data.kind === kind && Number.isSafeInteger(count) && count >= 0) {
          const offerCount = Number.isSafeInteger(data.offer_count) && data.offer_count >= 0 ? data.offer_count : null;
          const carrierCount = Number.isSafeInteger(data.carrier_count) && data.carrier_count >= 0 ? data.carrier_count : null;
          setResult({ ownerKey, count, offerCount, carrierCount });
        } else setResult(previous => ({ ...(previous?.ownerKey === ownerKey ? previous : {}), ownerKey, error: true }));
      } catch {
        if (current()) setResult(previous => ({ ...(previous?.ownerKey === ownerKey ? previous : {}), ownerKey, error: true }));
      } finally {
        if (controller === request) {
          clearTimeout(requestTimeout);
          timeout = null;
          controller = null;
        }
      }
    };
    const onBlur = () => { cancel(); };
    const removeFocus = navigation.addListener('focus', refresh);
    const removeBlur = navigation.addListener('blur', onBlur);
    const appListener = AppState.addEventListener('change', state => state === 'active' ? refresh() : onBlur());
    refresh();
    return () => { alive = false; cancel(); removeFocus(); removeBlur(); appListener.remove(); };
  }, [enabled, ownerKey, role, navigation, session?.user?.id, currentRole]);
  if (!EXTERNAL_FREIGHT_ENABLED || showBack || !['driver', 'client'].includes(role)) return children;
  const labels = {
    RU: role === 'driver' ? 'Лента грузов' : 'Лента машин',
    KK: role === 'driver' ? 'Жүк лентасы' : 'Көлік лентасы',
    ZH: role === 'driver' ? '货源信息' : '车辆信息',
    EN: role === 'driver' ? 'Cargo feed' : 'Truck feed',
  };
Object.assign(labels, withAdditionalLanguageTree(labels));
  const palette = ceramic ? ceramicColors : colors;
  const count = result?.ownerKey === ownerKey ? result.count ?? null : null;
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
        {result?.ownerKey === ownerKey && result.error ? <Feather name="alert-circle" size={15} color={palette.text} accessibilityLabel={t('load_error')} /> : null}
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
