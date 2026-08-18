import React from 'react';
import { AppState, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

import BackgroundLocationDisclosureModal from './BackgroundLocationDisclosureModal';
import { marketAPI } from '../../utils/marketAPI';
import {
  getBackgroundLocationPermissionState,
  openLocationSettings,
  requestBackgroundLocationPermission,
  requestForegroundLocationPermission,
} from '../../utils/backgroundLocation';
import { registerLocationPermissionRequestHandler } from '../../utils/locationPermissionCoordinator';
import { useI18n } from '../../utils/useI18n';

const COPY = {
  RU: { label: 'Геолокация для рейса', allow: 'Разрешить', granted: 'Геолокация разрешена' },
  EN: { label: 'Trip location', allow: 'Allow', granted: 'Location allowed' },
  ZH: { label: '运输位置权限', allow: '允许', granted: '位置权限已允许' },
  KK: { label: 'Рейс геолокациясы', allow: 'Рұқсат беру', granted: 'Геолокацияға рұқсат берілді' },
};

export default function DealLocationPermissionGate({ dealId, role, initialStatus, children }) {
  const { lang } = useI18n();
  const ui = COPY[lang] || COPY.RU;
  const isDriver = role === 'driver';
  const [dealStatus, setDealStatus] = React.useState(initialStatus || null);
  const [permission, setPermission] = React.useState(null);
  const [modalVisible, setModalVisible] = React.useState(false);
  const [modalMode, setModalMode] = React.useState('disclosure');
  const [busy, setBusy] = React.useState(false);
  const pendingResolve = React.useRef(null);
  const mounted = React.useRef(true);

  const resolvePending = React.useCallback((result) => {
    const resolve = pendingResolve.current;
    pendingResolve.current = null;
    if (resolve) resolve(result);
  }, []);

  const refreshPermission = React.useCallback(async () => {
    if (Platform.OS !== 'android') return null;
    const state = await getBackgroundLocationPermissionState();
    if (mounted.current) setPermission(state);
    return state;
  }, []);

  React.useEffect(() => {
    mounted.current = true;
    if (Platform.OS === 'android' && isDriver) refreshPermission();
    return () => {
      mounted.current = false;
      resolvePending({ ok: false, reason: 'permission_host_unmounted' });
    };
  }, [isDriver, refreshPermission, resolvePending]);

  React.useEffect(() => {
    if (!dealId || !isDriver) return undefined;
    let alive = true;
    const refreshDeal = async () => {
      try {
        const result = await marketAPI.getDeal(dealId);
        if (alive && result?.status) setDealStatus(result.status);
      } catch { /* keep last status */ }
    };
    refreshDeal();
    const timer = setInterval(refreshDeal, 15000);
    return () => { alive = false; clearInterval(timer); };
  }, [dealId, isDriver]);

  const beginDisclosure = React.useCallback(async (context = {}) => {
    if (Platform.OS !== 'android') return { ok: false, reason: 'android_only' };
    const current = await refreshPermission();
    if (current?.ok) return { ok: true };

    // Deduplicate simultaneous taps (e.g. banner + Start trip).
    if (pendingResolve.current) return { ok: false, reason: 'permission_flow_busy' };

    return new Promise((resolve) => {
      pendingResolve.current = resolve;
      setModalMode('disclosure');
      setModalVisible(true);
    });
  }, [refreshPermission]);

  React.useEffect(() => {
    if (Platform.OS !== 'android' || !isDriver) return undefined;
    return registerLocationPermissionRequestHandler(beginDisclosure);
  }, [beginDisclosure, isDriver]);

  const completeIfGranted = React.useCallback(async () => {
    setBusy(true);
    const state = await refreshPermission();
    setBusy(false);
    if (state?.ok) {
      setModalVisible(false);
      setModalMode('disclosure');
      resolvePending({ ok: true });
      return true;
    }
    return false;
  }, [refreshPermission, resolvePending]);

  const continueDisclosure = React.useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const foreground = await requestForegroundLocationPermission();
    if (!foreground.ok) {
      setBusy(false);
      if (foreground.reason === 'settings_required') setModalMode('settings');
      else {
        setModalVisible(false);
        resolvePending({ ok: false, reason: foreground.reason || 'fg_denied' });
      }
      return;
    }

    const background = await requestBackgroundLocationPermission();
    setBusy(false);
    if (background.ok) {
      const state = await refreshPermission();
      setModalVisible(false);
      resolvePending(state?.ok ? { ok: true } : { ok: false, reason: 'bg_state_mismatch' });
      return;
    }

    // Android 11+ commonly requires the app settings page for "Allow all the
    // time". Keep the explanation visible and give the user a direct action.
    setModalMode('settings');
  }, [busy, refreshPermission, resolvePending]);

  const cancelDisclosure = React.useCallback(() => {
    if (busy) return;
    setModalVisible(false);
    setModalMode('disclosure');
    resolvePending({ ok: false, reason: 'user_cancelled' });
  }, [busy, resolvePending]);

  const openSettings = React.useCallback(async () => {
    if (busy) return;
    setBusy(true);
    await openLocationSettings();
    setBusy(false);
  }, [busy]);

  React.useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') completeIfGranted();
    });
    return () => sub?.remove?.();
  }, [completeIfGranted]);

  const showBar = Platform.OS === 'android' && isDriver && dealStatus === 'accepted';
  const granted = permission?.ok === true;

  return (
    <View style={s.root}>
      <View style={s.content}>{children}</View>

      {showBar ? (
        <View style={s.bar} testID="deal-background-location-bar">
          <View style={s.barIcon}><Feather name={granted ? 'check' : 'map-pin'} size={18} color="#168759" /></View>
          <View style={s.barTextWrap}>
            <Text style={s.barLabel}>{granted ? ui.granted : ui.label}</Text>
          </View>
          {!granted ? (
            <TouchableOpacity
              style={s.allowButton}
              onPress={() => { beginDisclosure({ source: 'permission_bar' }); }}
              testID="deal-background-location-allow"
              accessibilityRole="button"
              accessibilityLabel={ui.allow}
            >
              <Text style={s.allowText}>{ui.allow}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <BackgroundLocationDisclosureModal
        visible={modalVisible}
        lang={lang}
        mode={modalMode}
        busy={busy}
        onContinue={continueDisclosure}
        onCancel={cancelDisclosure}
        onOpenSettings={openSettings}
        onCheckAgain={completeIfGranted}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7F9F8' },
  content: { flex: 1, minHeight: 0 },
  bar: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DDE5E0',
  },
  barIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#E9F6EF', alignItems: 'center', justifyContent: 'center' },
  barTextWrap: { flex: 1, minWidth: 0 },
  barLabel: { fontSize: 13.5, fontWeight: '850', color: '#203029' },
  allowButton: { minHeight: 40, paddingHorizontal: 15, borderRadius: 13, backgroundColor: '#168759', alignItems: 'center', justifyContent: 'center' },
  allowText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
});
