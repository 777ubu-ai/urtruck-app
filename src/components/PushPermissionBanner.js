import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { push } from '../utils/push';
import { createPushPermissionMonitor } from '../utils/pushPermissionMonitor';
import { useI18n } from '../utils/useI18n';
import { useV1Colors } from '../theme/designV1';
import { useTheme } from '../utils/ThemeContext';

const COPY = {
  RU: {
    title: 'Не пропускайте предложения',
    body: 'Включите уведомления UrTruck — новые ставки и изменения сделки придут сразу.',
    enable: 'Включить',
    denied: 'Уведомления заблокированы в браузере. Разрешите их для urtruck.kz в настройках сайта.',
    deniedNative: 'Уведомления отключены в настройках телефона. Разрешите их для UrTruck.',
    retry: 'Проверить снова',
    settings: 'Открыть настройки',
  },
  EN: {
    title: 'Don’t miss new offers',
    body: 'Enable UrTruck notifications to receive bids and deal updates immediately.',
    enable: 'Enable',
    denied: 'Notifications are blocked by the browser. Allow them for urtruck.kz in site settings.',
    deniedNative: 'Notifications are disabled in your phone settings. Allow them for UrTruck.',
    retry: 'Check again',
    settings: 'Open settings',
  },
  ZH: {
    title: '不要错过新报价',
    body: '开启 UrTruck 通知，及时收到新报价和交易状态变化。',
    enable: '开启通知',
    denied: '浏览器已阻止通知。请在网站设置中允许 urtruck.kz 发送通知。',
    deniedNative: '手机设置已关闭通知。请允许 UrTruck 发送通知。',
    retry: '重新检查',
    settings: '打开设置',
  },
  KK: {
    title: 'Ұсыныстарды өткізіп алмаңыз',
    body: 'UrTruck хабарламаларын қосыңыз — жаңа ұсыныстар мен мәміле өзгерістері бірден келеді.',
    enable: 'Қосу',
    denied: 'Браузер хабарламаларды бұғаттаған. Сайт баптауларында urtruck.kz үшін рұқсат беріңіз.',
    deniedNative: 'Телефон баптауларында хабарламалар өшірулі. UrTruck үшін рұқсат беріңіз.',
    retry: 'Қайта тексеру',
    settings: 'Баптауларды ашу',
  },
};

export const getPushPermissionHost = () => (
  Platform.OS === 'web'
    && typeof window !== 'undefined'
    && window.location?.host
    ? window.location.host
    : 'urtruck.kz'
);

export default function PushPermissionBanner({ enabled }) {
  const { lang } = useI18n();
  const colors = useV1Colors();
  const { isDark } = useTheme();
  const accentColor = isDark ? colors.success : colors.driver;
  const c = COPY[lang] || COPY.RU;
  const native = push.isNative();
  const deniedCopy = native ? c.deniedNative : c.denied.replace('urtruck.kz', getPushPermissionHost());
  const [permission, setPermission] = useState('loading');
  const [busy, setBusy] = useState(false);
  const monitorRef = useRef(null);

  useEffect(() => {
    const supported = Platform.OS === 'web' ? push.isSupported() : native;
    if (!enabled || !supported) {
      setPermission('hidden');
      monitorRef.current = null;
      return undefined;
    }
    const monitor = createPushPermissionMonitor({
      appState: AppState,
      getPermission: async () => {
        const current = Platform.OS === 'web' ? await push.permission() : await push.nativePermission();
        // nativePermission() currently reports SDK/bridge failures as
        // "unsupported"; keep that distinct from an OS-level denial.
        return native && current === 'unsupported' ? 'unknown' : current;
      },
      onPermission: setPermission,
      onGranted: () => {
        // Registration runs on initial grant or a denied/unknown → granted
        // transition, never on every ordinary foreground return.
        push.autoRegister().catch(() => {});
      },
    });
    monitorRef.current = monitor;
    return () => {
      monitor.remove();
      if (monitorRef.current === monitor) monitorRef.current = null;
    };
  }, [enabled, native]);

  const refresh = () => monitorRef.current?.refresh(true);

  const enablePush = async () => {
    setBusy(true);
    try {
      if (native && permission === 'denied') {
        await push.openNativeNotificationSettings();
        return;
      }
      const r = Platform.OS === 'web'
        ? await push.subscribe({ requestPermission: true })
        : await push.registerNative();
      const current = Platform.OS === 'web' ? await push.permission() : await push.nativePermission();
      // The explicit button already attempted registration; synchronize the
      // monitor without triggering a second registration for the same grant.
      monitorRef.current?.setPermission(current);
      setPermission(r?.ok ? 'granted' : (r?.reason === 'denied' ? 'denied' : current));
    } catch {
      await monitorRef.current?.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!enabled || permission === 'loading' || permission === 'hidden' || permission === 'granted') return null;
  const denied = permission === 'denied';

  return (
    <View style={[s.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="push-permission-banner">
      <View style={[s.icon, { backgroundColor: colors.driverSoft }]}><Feather name="bell" size={18} color={accentColor} /></View>
      <View style={s.copy}>
        <Text style={[s.title, { color: colors.text }]}>{c.title}</Text>
        <Text style={[s.body, { color: colors.textMuted }]}>{denied ? deniedCopy : c.body}</Text>
      </View>
      <TouchableOpacity
        style={[s.action, { borderColor: accentColor }]}
        onPress={denied && !native ? refresh : enablePush}
        disabled={busy}
        testID="push-permission-enable"
      >
        <Text style={[s.actionText, { color: accentColor }]}>{denied ? (native ? c.settings : c.retry) : c.enable}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 4,
    minHeight: 64,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 13, lineHeight: 17, fontWeight: '700' },
  body: { fontSize: 11.5, lineHeight: 15, marginTop: 2 },
  action: { minHeight: 38, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 12, fontWeight: '700' },
});
