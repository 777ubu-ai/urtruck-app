import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { API_URL } from '../config/env';
import { useI18n } from '../utils/useI18n';

const LOCAL_VERSION = '1.0.50';

export { LOCAL_VERSION };

export default function UpdateBanner() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const [serverVersion, setServerVersion] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const check = async () => {
      try {
        const r = await fetch(`${API_URL}/api/version`);
        const d = await r.json();
        if (d.version && d.version !== LOCAL_VERSION) {
          setServerVersion(d.version);
          setShow(true);
        }
      } catch {}
    };
    check();
    const iv = setInterval(check, 5 * 60 * 1000); // каждые 5 мин
    return () => clearInterval(iv);
  }, []);

  if (!show) return null;

  return (
    <View style={s.banner}>
      <Text style={s.text}>{t('update_available')} {serverVersion}</Text>
      <TouchableOpacity style={s.btn} onPress={() => {
        if (Platform.OS === 'web') window.location.reload(true);
      }}>
        <Text style={s.btnText}>{t('update_btn')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setShow(false)} style={s.close}>
        <Text style={s.closeText}>×</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#4F46E5', paddingHorizontal: 14, paddingVertical: 10,
    gap: 10,
  },
  text: { color: '#FFF', fontSize: 13, flex: 1, fontWeight: '600' },
  btn: { backgroundColor: '#FFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  btnText: { color: '#4F46E5', fontSize: 12, fontWeight: '800' },
  close: { padding: 4 },
  closeText: { color: '#FFF', fontSize: 18, fontWeight: '700' },
});
