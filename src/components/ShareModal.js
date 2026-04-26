import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Linking, Platform } from 'react-native';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from './Toast';
import { WEB_URL } from '../config/env';

export default function ShareModal({ visible, onClose, shareText = 'UrTruck!', phone, driverId }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();

  const profileUrl = driverId ? `${WEB_URL}/driver/${driverId}` : WEB_URL;

  const handleWhatsApp = () => {
    const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    const msg = encodeURIComponent(shareText);
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${msg}`
      : `https://wa.me/?text=${msg}`;
    Linking.openURL(url).catch(() => toast('Не удалось открыть WhatsApp', 'error'));
    onClose();
  };

  const handleTelegram = () => {
    const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    const url = cleanPhone
      ? `https://t.me/+${cleanPhone}`
      : `https://t.me/share/url?url=${encodeURIComponent(profileUrl)}&text=${encodeURIComponent(shareText)}`;
    Linking.openURL(url).catch(() => toast('Не удалось открыть Telegram', 'error'));
    onClose();
  };

  const handleWeChat = () => {
    // WeChat не поддерживает deep link из браузера напрямую
    toast('WeChat: скопируйте ссылку и отправьте вручную', 'info', 3000);
    copyLink();
  };

  const copyLink = async () => {
    const url = profileUrl;
    try {
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast('✅ Ссылка скопирована', 'success');
      } else {
        toast(url, 'info', 5000);
      }
    } catch {
      toast(url, 'info', 5000);
    }
    onClose();
  };

  const CHANNELS = [
    { name: 'WhatsApp', icon: 'WA', color: '#25D366', onPress: handleWhatsApp },
    { name: 'Telegram', icon: 'TG', color: '#0088CC', onPress: handleTelegram },
    { name: 'WeChat', icon: 'WC', color: '#7BB32E', onPress: handleWeChat },
    { name: 'Ссылка', icon: '🔗', color: '#64748B', onPress: copyLink },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={[s.sheet, { backgroundColor: theme.bg, borderColor: theme.border }]} activeOpacity={1} onPress={() => {}}>
          <View style={s.handle} />
          <Text style={[s.title, { color: theme.text }]}>{t('share')}</Text>
          <View style={s.grid}>
            {CHANNELS.map((ch) => (
              <TouchableOpacity
                key={ch.name}
                style={[s.channelBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={ch.onPress}
                activeOpacity={0.7}
              >
                <View style={[s.iconWrap, { backgroundColor: ch.color + '20' }]}>
                  <Text style={{ fontSize: 24 }}>{ch.icon}</Text>
                </View>
                <Text style={[s.channelName, { color: theme.textSecondary }]}>{ch.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, borderWidth: 1 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#44403C', alignSelf: 'center', marginBottom: 18 },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 18 },
  grid: { flexDirection: 'row', justifyContent: 'space-around' },
  channelBtn: { alignItems: 'center', gap: 8, padding: 12, borderRadius: 16, borderWidth: 1, width: 76 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  channelName: { fontSize: 10, fontWeight: '600' },
});
