import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Linking, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from './Toast';
import { WEB_URL } from '../config/env';

// ShareModal — UrTruck brand v3.
//
// Channel buttons keep each network's own brand color (Telegram blue,
// WhatsApp green, WeChat green). That's external brand recognition — it's
// fine to deviate from our internal Emerald+Orange palette there. The rest
// of the sheet (background, text, copy-link button) follows the app palette.
//
// `shareText` is the pre-built body (see utils/share.js); we attach the URL
// at the end here so individual call sites don't have to remember to do it.

export default function ShareModal({
  visible, onClose,
  shareText = 'UrTruck',
  url,                          // explicit deep-link; overrides driverId fallback
  phone,
  driverId,
}) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();

  const baseUrl = WEB_URL || 'https://urtruck.kz';
  const finalUrl = url || (driverId ? `${baseUrl}/driver/${driverId}` : baseUrl);
  const fullShareText = shareText.includes(finalUrl) ? shareText : `${shareText}\n${finalUrl}`;

  const handleWhatsApp = () => {
    const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    const msg = encodeURIComponent(fullShareText);
    const link = cleanPhone ? `https://wa.me/${cleanPhone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    Linking.openURL(link).catch(() => toast(t('generic_error'), 'error'));
    onClose();
  };

  const handleTelegram = () => {
    // Telegram's share/url endpoint takes URL + text separately. Including
    // the URL inside `text` too would duplicate it in the preview, so strip
    // the trailing URL line from the body if present.
    const escaped = finalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const body = fullShareText.replace(new RegExp(`\\n?${escaped}\\s*$`), '').trim();
    const link = `https://t.me/share/url?url=${encodeURIComponent(finalUrl)}&text=${encodeURIComponent(body)}`;
    Linking.openURL(link).catch(() => toast(t('generic_error'), 'error'));
    onClose();
  };

  // Stage 52 / P1-9 + P1-10: на iOS native ветка `navigator.clipboard` не
  // работала и буфер обмена не наполнялся — пользователь видел toast с
  // самим URL, но «вставить» в Notes/Telegram было нечего. Переписали через
  // expo-clipboard.Clipboard.setStringAsync — работает на iOS / Android / web.
  const copyToClipboard = async (text) => {
    try {
      await Clipboard.setStringAsync(String(text || ''));
      return true;
    } catch (e) {
      // Самый редкий путь: web без navigator.clipboard (старые браузеры).
      try {
        if (Platform.OS === 'web' && navigator.clipboard) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch {}
      return false;
    }
  };

  const handleWeChat = async () => {
    // WeChat не принимает произвольные HTTPS deep-link'и из браузера, но
    // если установлено нативное приложение — пробуем открыть `weixin://`.
    // Иначе honest path: копируем полный share text и подсказываем
    // вставить в WeChat вручную.
    try {
      const canOpen = await Linking.canOpenURL('weixin://');
      if (canOpen) {
        await Linking.openURL('weixin://');
      }
    } catch {}
    const ok = await copyToClipboard(fullShareText);
    if (ok) toast('✅ ' + t('share_copied_open_wechat'), 'success', 4000);
    else toast(fullShareText, 'info', 6000);
  };

  const copyLink = async () => {
    const ok = await copyToClipboard(finalUrl);
    if (ok) toast('✅ ' + t('share_link_copied'), 'success');
    else toast(finalUrl, 'info', 5000);
    onClose();
  };

  // Stage 44: emoji → FontAwesome5 brand glyphs (link is solid).
  // `brand` toggles the FA5 Brands font face; the icon's tint matches the
  // network's official color so the iconography reads at a glance.
  const CHANNELS = [
    { name: 'Telegram', icon: 'telegram', brand: true,  color: '#0088CC', onPress: handleTelegram },
    { name: 'WhatsApp', icon: 'whatsapp', brand: true,  color: '#25D366', onPress: handleWhatsApp },
    { name: 'WeChat',   icon: 'weixin',   brand: true,  color: '#07C160', onPress: handleWeChat },
    { name: t('share_copy_link'), icon: 'link', brand: false, color: '#168A5B', onPress: copyLink },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={[s.sheet, { backgroundColor: theme.bg, borderColor: theme.border }]} activeOpacity={1} onPress={() => {}}>
          <View style={s.handle} />
          <Text style={[s.title, { color: theme.text }]}>{t('share')}</Text>

          {/* Brand preview chip — confirms what's about to be sent */}
          <View style={[s.previewBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.previewLabel, { color: '#168A5B' }]}>UrTruck</Text>
            <Text style={[s.previewText, { color: theme.textSecondary }]} numberOfLines={6}>
              {fullShareText}
            </Text>
          </View>

          <View style={s.grid}>
            {CHANNELS.map((ch) => (
              <TouchableOpacity
                key={ch.name}
                style={[s.channelBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={ch.onPress}
                activeOpacity={0.7}
              >
                <View style={[s.iconWrap, { backgroundColor: ch.color + '22' }]}>
                  <FontAwesome5 name={ch.icon} size={20} color={ch.color} brand={ch.brand} />
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
  title: { fontSize: 20, fontWeight: '800', marginBottom: 14 },
  previewBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16 },
  previewLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6 },
  previewText: { fontSize: 12, lineHeight: 17 },
  grid: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  channelBtn: { flex: 1, alignItems: 'center', gap: 6, padding: 10, borderRadius: 14, borderWidth: 1 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  channelName: { fontSize: 11, fontWeight: '700' },
});
