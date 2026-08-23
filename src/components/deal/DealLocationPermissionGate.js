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

// Canonical visible consent host for deal-map GPS and Start trip.
// Android must show UrTruck's prominent disclosure BEFORE any OS location
// prompt. First map open is the preferred trigger; Start trip remains a safe
// fallback for drivers who never opened the map.
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
  const acceptedInThisWorkspace = React.useRef(false);

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

  const successPayload = React.useCallback(() => ({
    ok: true,
    foregroundOnly: Platform.OS !== 'android',
    foregroundService: Platform.OS === 'android',
    backgroundRequired: Platform.OS === 'android',
  }), []);

  const beginDisclosure = React.useCallback(async (context = {}) => {
    if (!supportsTripDisclosure) return { ok: false, reason: 'disclosure_not_supported' };

    // Shippers may open the live map but never broadcast their own GPS.
    if (!isDriver) return { ok: true, notRequired: true, source: context?.source || null };

    if (pendingResolve.current) return { ok: false, reason: 'permission_flow_busy' };

    // Once the driver accepted this workspace's disclosure and Android still
    // has the required grant, Start trip must not show a duplicate modal.
    if (acceptedInThisWorkspace.current) {
      const state = await refreshPermission();
      if (state?.ok) return successPayload();
      acceptedInThisWorkspace.current = false;
    }

    return new Promise((resolve) => {
      pendingResolve.current = resolve;
      setModalMode('disclosure');
      setModalVisible(true);
    });
  }, [isDriver, refreshPermission, successPayload, supportsTripDisclosure]);

  React.useEffect(() => {
    if (!supportsTripDisclosure) return undefined;
    // Register for both deal roles: the map component can call one canonical
    // coordinator. beginDisclosure passes shippers through without GPS prompts.
    return registerLocationPermissionRequestHandler(beginDisclosure);
  }, [beginDisclosure, supportsTripDisclosure]);

  const completeIfGranted = React.useCallback(async () => {
    if (!pendingResolve.current) return false;
    setBusy(true);
    const state = await refreshPermission();
    setBusy(false);
    if (state?.ok) {
      acceptedInThisWorkspace.current = true;
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

    // Android 11+ normally grants background access from the app settings
    // screen. Do NOT auto-launch requestBackgroundPermissionsAsync here: on
    // Xiaomi/MIUI this transition can kill the activity after the foreground
    // dialog. Keep the UrTruck disclosure visible and let the driver explicitly
    // tap "Open settings", then verify the grant on AppState resume.
    if (Platform.OS === 'android') {
      const state = await refreshPermission();
      if (state?.ok) {
        acceptedInThisWorkspace.current = true;
        setModalVisible(false);
        setModalMode('disclosure');
        resolvePending(successPayload());
      } else {
        setModalMode('settings');
      }
      return;
    }

    const state = await refreshPermission();
    if (state?.ok) {
      acceptedInThisWorkspace.current = true;
      setModalVisible(false);
      setModalMode('disclosure');
      resolvePending(successPayload());
    } else {
      setModalVisible(false);
      setModalMode('disclosure');
      resolvePending({ ok: false, reason: 'fg_state_mismatch' });
    }
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
