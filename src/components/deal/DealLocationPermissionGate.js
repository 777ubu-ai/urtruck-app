import React from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import BackgroundLocationDisclosureModal from './BackgroundLocationDisclosureModal';
import {
  getBackgroundLocationPermissionState,
  openLocationSettings,
  requestForegroundLocationPermission,
} from '../../utils/backgroundLocation';
import { registerLocationPermissionRequestHandler } from '../../utils/locationPermissionCoordinator';
import { useI18n } from '../../utils/useI18n';
import { useAuth } from '../../utils/AuthContext';

// This component is intentionally an invisible permission host.
// The only normal Android entry point is the driver's explicit "Start trip"
// action in DealWorkspaceScreenV2. There is no proactive permission banner.
export default function DealLocationPermissionGate({ role, children }) {
  const { lang } = useI18n();
  const { session } = useAuth();
  const effectiveRole = role || session?.user?.role || null;
  const isDriver = effectiveRole === 'driver';
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
    return getBackgroundLocationPermissionState();
  }, []);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      resolvePending({ ok: false, reason: 'permission_host_unmounted' });
    };
  }, [resolvePending]);

  const beginDisclosure = React.useCallback(async () => {
    if (Platform.OS !== 'android') return { ok: false, reason: 'android_only' };
    const current = await refreshPermission();
    if (current?.ok) return { ok: true, foregroundService: true };

    // Deduplicate repeated Start-trip taps while the disclosure is already open.
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
    if (!pendingResolve.current) return false;
    setBusy(true);
    const state = await refreshPermission();
    setBusy(false);
    if (state?.ok) {
      setModalVisible(false);
      setModalMode('disclosure');
      resolvePending({ ok: true, foregroundService: true });
      return true;
    }
    return false;
  }, [refreshPermission, resolvePending]);

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

    // Android active-trip tracking uses a location foreground service.
    // ACCESS_BACKGROUND_LOCATION / "Allow all the time" is intentionally absent.
    const state = await refreshPermission();
    setModalVisible(false);
    setModalMode('disclosure');
    resolvePending(state?.ok
      ? { ok: true, foregroundService: true }
      : { ok: false, reason: 'fg_state_mismatch' });
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