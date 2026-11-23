import { withAdditionalLanguageTree, } from '../../utils/additionalLocales.js';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors, useDriverCeramicColors } from '../../theme/designV1';
import { useI18n } from '../../utils/useI18n';
import { useAuth } from '../../utils/AuthContext';
import { storage } from '../../utils/storage';
import { sessionRole } from '../../utils/externalFreightSession';
import { EXTERNAL_FREIGHT_ENABLED, externalFreightAPI } from '../../utils/externalFreightFeed';

// Only the latest successful count per role is stored on disk, with its owner.
const countSnapshots = new Map();
const snapshotLifetime = 5 * 60 * 1000;
function cachedCount(ownerKey) {
  const snapshot = countSnapshots.get(ownerKey);
  return snapshot || null;
}
function rememberCount(snapshot) {
  countSnapshots.delete(snapshot.ownerKey);
  countSnapshots.set(snapshot.ownerKey, snapshot);
  if (countSnapshots.size > 8) countSnapshots.delete(countSnapshots.keys().next().value);
}

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
  const [result, setResult] = useState(() => cachedCount(ownerKey));
  useEffect(() => {
    if (!enabled || !session?.user?.id || currentRole !== role) return undefined;
    let alive = true, controller = null, timeout = null, retryTimer = null;
    setResult(cachedCount(ownerKey));
    const current = () => alive && ownerRef.current === ownerKey;
    const storageKey = `ur_external_freight_count_v1:${role}`;
    let acceptStoredCount = true;
    storage.get(storageKey).then(raw => {
      if (!current() || !acceptStoredCount || !raw) return;
      let snapshot;
      try { snapshot = JSON.parse(raw); } catch { return; }
      if (snapshot?.ownerKey !== ownerKey || !Number.isSafeInteger(snapshot.count) || snapshot.count < 0
        || !Number.isFinite(snapshot.updatedAt) || snapshot.updatedAt <= 0) return;
      const stored = { ownerKey, count: snapshot.count, updatedAt: snapshot.updatedAt, stale: snapshot.stale === true };
      setResult(previous => {
        if (previous?.ownerKey === ownerKey && previous.updatedAt >= stored.updatedAt) return previous;
        return { ...stored, error: previous?.ownerKey === ownerKey && previous.error };
      });
    });
    const cancel = () => {
      const request = controller;
      controller = null;
      clearTimeout(retryTimer);
      retryTimer = null;
      clearTimeout(timeout);
      timeout = null;
      request?.abort();
    };
    const refresh = async (attempt = 0) => {
      if (!current() || controller || !navigation.isFocused() || AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
      const request = new AbortController();
      controller = request;
      let retryable = false;
      let requestTimeout;
      const timedOut = new Promise((_, reject) => {
        requestTimeout = setTimeout(() => { request.abort(); reject(new Error('count_timeout')); }, 8000);
      });
      timeout = requestTimeout;
      try {
        const data = await Promise.race([
          externalFreightAPI.count(request.signal, () => current() && !request.signal.aborted),
          timedOut,
        ]);
        if (!current() || controller !== request) return;
        if (request.signal.aborted) throw new Error('count_timeout');
        const kind = role === 'driver' ? 'cargo' : 'vehicle';
        // Счётчик объединённой выдачи включает и предложения, и контакты.
        const count = data.count;
        const offerCount = Number.isSafeInteger(data.offer_count) && data.offer_count >= 0 ? data.offer_count : null;
        const carrierCount = Number.isSafeInteger(data.carrier_count) && data.carrier_count >= 0 ? data.carrier_count : null;
        const hasParts = data.offer_count != null || data.carrier_count != null;
        const partsMatch = !hasParts || (offerCount !== null && carrierCount !== null && count === offerCount + carrierCount);
        if (data.ok && data.kind === kind && Number.isSafeInteger(count) && count >= 0 && partsMatch) {
          acceptStoredCount = false;
          retryable = data.stale === true;
          const snapshot = {
            ownerKey, count, offerCount, carrierCount,
            updatedAt: Date.parse(data.as_of) || Date.now(),
            stale: data.stale === true,
          };
          rememberCount(snapshot);
          setResult(snapshot);
          void storage.set(storageKey, JSON.stringify(snapshot));
        } else {
          const unauthorized = data.status === 401 || data.status === 403;
          if (unauthorized) {
            acceptStoredCount = false;
            countSnapshots.delete(ownerKey);
            void storage.remove(storageKey);
          }
          retryable = !unauthorized;
          setResult(previous => ({ ...(!unauthorized && previous?.ownerKey === ownerKey ? previous : {}), ownerKey, error: true }));
        }
      } catch {
        if (current() && controller === request) {
          retryable = true;
          setResult(previous => ({ ...(previous?.ownerKey === ownerKey ? previous : {}), ownerKey, error: true }));
        }
      } finally {
        if (controller === request) {
          clearTimeout(requestTimeout);
          timeout = null;
          controller = null;
          if (retryable && current() && navigation.isFocused() && AppState.currentState === 'active') {
            const delay = attempt === 0 ? 2000 : attempt === 1 ? 5000 : 60000;
            retryTimer = setTimeout(() => { retryTimer = null; refresh(Math.min(attempt + 1, 2)); }, delay);
          }
        }
      }
    };
    const onBlur = () => { cancel(); };
    const onFocus = () => { cancel(); refresh(); };
    const removeFocus = navigation.addListener('focus', onFocus);
    const removeBlur = navigation.addListener('blur', onBlur);
    const appListener = AppState.addEventListener('change', state => state === 'active' ? onFocus() : onBlur());
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
  const failed = result?.ownerKey === ownerKey && result.error;
  const outdated = count !== null && (result.stale || Date.now() - result.updatedAt >= snapshotLifetime);
  const countText = count === null ? (failed ? '—' : '…') : String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const label = labels[lang] || labels.EN;
  return <View>
    {children}
    <View style={styles.entrySlot} pointerEvents="box-none">
      <TouchableOpacity testID="external-freight-entry" accessibilityRole="button" accessibilityLabel={count === null ? label : `${label}, ${countText}`}
        accessibilityState={{ busy: count === null && !failed }}
        onPress={() => navigation.navigate('ExternalFreightFeed')}
        style={[styles.entry, { backgroundColor: colors.driverSoft, borderColor: palette.border }]}>
        <Feather name="list" size={15} color={palette.text} />
        <Text numberOfLines={1} style={[styles.label, { color: palette.text }]}>{label}</Text>
        {failed || outdated ? <Feather name={failed ? 'alert-circle' : 'clock'} size={15} color={palette.text}
          accessibilityLabel={failed ? t('load_error') : t('track_updated')} /> : null}
        <Text testID="external-freight-count" numberOfLines={1}
          style={[styles.count, { color: palette.text, backgroundColor: palette.surface }]}>{countText}</Text>
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
