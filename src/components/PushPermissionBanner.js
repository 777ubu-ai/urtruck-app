import React, { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { push } from '../utils/push';
import { useI18n } from '../utils/useI18n';

const COPY = {
  RU: {
    title: 'Не пропускайте предложения',
    body: 'Включите уведомления UrTruck — новые ставки и изменения сделки придут сразу.',
    enable: 'Включить',
    denied: 'Уведомления заблокированы в браузере. Разрешите их для urtruck.kz в настройках сайта.',
    retry: 'Проверить снова',
  },
  EN: {
    title: 'Don’t miss new offers',
    body: 'Enable UrTruck notifications to receive bids and deal updates immediately.',
    enable: 'Enable',
    denied: 'Notifications are blocked by the browser. Allow them for urtruck.kz in site settings.',
    retry: 'Check again',
  },
  ZH: {
    title: '不要错过新报价',
    body: '开启 UrTruck 通知，及时收到新报价和交易状态变化。',
    enable: '开启通知',
    denied: '浏览器已阻止通知。请在网站设置中允许 urtruck.kz 发送通知。',
    retry: '重新检查',
  },
  KK: {
    title: 'Ұсыныстарды өткізіп алмаңыз',
    body: 'UrTruck хабарламаларын қосыңыз — жаңа ұсыныстар мен мәміле өзгерістері бірден келеді.',
    enable: 'Қосу',
    denied: 'Браузер хабарламаларды бұғаттаған. Сайт баптауларында urtruck.kz үшін рұқсат беріңіз.',
    retry: 'Қайта тексеру',
  },
};

export default function PushPermissionBanner({ enabled }) {
  const { lang } = useI18n();
  const c = COPY[lang] || COPY.RU;
  const [permission, setPermission] = useState('loading');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (Platform.OS !== 'web' || !enabled || !push.isSupported()) {
      setPermission('hidden');
      return;
    }
    const p = await push.permission();
    setPermission(p);
    if (p === 'granted') {
      // Re-bind an existing browser subscription to the current authenticated
      // user. This is idempotent and repairs a token after login/account switch.
      push.subscribe({ requestPermission: false }).catch(() => {});
    }
  }, [enabled]);

  useEffect(() => { refresh(); }, [refresh]);

  const enablePush = async () => {
    setBusy(true);
    try {
      const r = await push.subscribe({ requestPermission: true });
      setPermission(r?.ok ? 'granted' : (r?.reason === 'denied' ? 'denied' : (await push.permission())));
    } catch {
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!enabled || permission === 'loading' || permission === 'hidden' || permission === 'granted') return null;
  const denied = permission === 'denied';

  return (
    <View style={s.wrap} testID="push-permission-banner">
      <View style={s.icon}><Feather name="bell" size={18} color="#34936B" /></View>
      <View style={s.copy}>
        <Text style={s.title}>{c.title}</Text>
        <Text style={s.body}>{denied ? c.denied : c.body}</Text>
      </View>
      <TouchableOpacity
        style={s.action}
        onPress={denied ? refresh : enablePush}
        disabled={busy}
        testID="push-permission-enable"
      >
        <Text style={s.actionText}>{denied ? c.retry : c.enable}</Text>
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
    borderColor: '#DDE9E2',
    backgroundColor: '#F6FBF8',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#EAF5EF', alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  title: { color: '#17221E', fontSize: 13, lineHeight: 17, fontWeight: '700' },
  body: { color: '#606B66', fontSize: 11.5, lineHeight: 15, marginTop: 2 },
  action: { minHeight: 38, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#34936B', alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#34936B', fontSize: 12, fontWeight: '700' },
});
