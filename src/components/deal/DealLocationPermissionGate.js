import React from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import BackgroundLocationDisclosureModal from './BackgroundLocationDisclosureModal';
import {
  getBackgroundLocationPermissionState,
  openLocationSettings,
  requestBackgroundLocationPermission,
  requestForegroundLocationPermission,
} from '../../utils/backgroundLocation';
import { registerLocationPermissionRequestHandler } from '../../utils/locationPermissionCoordinator';
import { useI18n } from '../../utils/useI18n';
import { useAuth } from '../../utils/AuthContext';

// Invisible permission/consent host for the real deal workspace.
// The driver's explicit "Start trip" action is the only normal entry point.
// Android and web show the same per-trip disclosure; there is no proactive banner.
export default function DealLocationPermissionGate({ role, children }) {
  const { lang } = useI18n();
  const { session } = useAuth();
  const effectiveRole = role || session?.user?.role || null;
  const isDriver = effectiveRole === 'driver';
  const supportsTripDisclosure = Platform.OS === 'android' || Platform.OS === 'web';
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
    if (!supportsTripDisclosure) return null;
    return getBackgroundLocationPermissionState();
  }, [supportsTripDisclosure]);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      resolvePending({ ok: false, reason: 'permission_host_unmounted' });
    };
  }, [resolvePending]);

  const beginDisclosure = React.useCallback(async () => {
    if (!supportsTripDisclosure) return { ok: false, reason: 'disclosure_not_supported' };

    // Per-trip consent is intentional: show the approved disclosure for every
    // new Start-trip action even when OS location permission was granted earlier.
    if (pendingResolve.current) return { ok: false, reason: 'permission_flow_busy' };

    return new Promise((resolve) => {
      pendingResolve.current = resolve;
      setModalMode('disclosure');
      setModalVisible(true);
    });
  }, [supportsTripDisclosure]);

  React.useEffect(() => {
    if (!supportsTripDisclosure || !isDriver) return undefined;
    return registerLocationPermissionRequestHandler(beginDisclosure);
  }, [beginDisclosure, isDriver, supportsTripDisclosure]);

  const successPayload = React.useCallback(() => ({
    ok: true,
    foregroundOnly: Platform.OS !== 'android',
    foregroundService: Platform.OS === 'android',
    backgroundRequired: Platform.OS === 'android',
  }), []);

  const completeIfGranted = React.useCallback(async () => {
    if (!pendingResolve.current) return false;
    setBusy(true);
    const state = await refreshPermission();
    setBusy(false);
    if (state?.ok) {
      setModalVisible(false);
      setModalMode('disclosure');
      resolvePending(successPayload());
      return true;
    }
    return false;
  }, [refreshPermission, resolvePending, successPayload]);

  const continueDisclosure = React.useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const foreground = await requestForegroundLocationPermission();
    setBusy(false);

    if (!foreground.ok) {
      if (foreground.reason === 'settings_required') setModalMode('settings');
      else {
        setModalVisible(false);
        resolvePending({ ok: false, reason: foreground.reason || 'fg_denied' });
      }
      return;
    }

    let state = null;
    if (Platform.OS === 'android') {
      setBusy(true);
      const background = await requestBackgroundLocationPermission();
      setBusy(false);
      if (!background.ok) {
        setModalMode('settings');
        return;
      }
      state = await refreshPermission();
    } else {
      state = await refreshPermission();
    }

    setModalVisible(false);
    setModalMode('disclosure');
    resolvePending(state?.ok
      ? successPayload()
      : { ok: false, reason: Platform.OS === 'android' ? 'bg_state_mismatch' : 'fg_state_mismatch' });
  }, [busy, refreshPermission, resolvePending, successPayload]);

  const cancelDisclosure = React.useCallback(() => {
    if (busy) return;
    setModalVisible(false);
    setModalMode('disclosure');
    resolvePending({ ok: false, reason: 'user_cancelled' });
  }, [busy, resolvePending]);

  const openSettings = React.useCallback(async () => {
    if (busy || Platform.OS === 'web') return;
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

  return (
    <View style={s.root}>
      <View style={s.content}>{children}</View>
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
});
