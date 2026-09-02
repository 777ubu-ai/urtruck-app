import React, { useCallback, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useToast } from '../components/Toast';
import { notificationsAPI } from '../utils/notificationsAPI';
import { notifyNotifRead } from '../utils/unreadEvents';
import { refreshAppIconBadge } from '../utils/appBadge';
import {v1Colors, useV1Colors, v1Radius, v1AccentFor} from '../theme/designV1';
import BrandBarWithShare from '../components/ui/v1/BrandBarWithShare';
import HeaderMenuButton from '../components/ui/v1/HeaderMenuButton';
import { useAuth } from '../utils/AuthContext';
import { useI18n } from '../utils/useI18n';
import { getLanguage } from '../utils/i18n';
import { useSafeRefresh } from '../hooks/useSafeRefresh';
import { localizeSystemMessage } from '../utils/places';
import Feather from '@expo/vector-icons/Feather';

const NOTIF_LOCALE = { RU: 'ru-RU', KK: 'kk-KZ', ZH: 'zh-CN', EN: 'en-US' };
function formatNotifTime(raw) {
  if (!raw) return "";
  let str = String(raw).trim();
  if (
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(str) &&
    !/[zZ]|[+\-]\d{2}:?\d{2}$/.test(str)
  ) {
    str = str.replace(" ", "T") + "Z";
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return String(raw).slice(0, 16).replace("T", " ");
  const locale = NOTIF_LOCALE[getLanguage && getLanguage()] || "ru-RU";
  try {
    return d.toLocaleString(locale, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(raw).slice(0, 16).replace("T", " ");
  }
}

function parseNotifUrl(url) {
  if (!url || typeof url !== 'string') return null;
  let cleaned = url.trim();
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      cleaned = `${parsed.pathname || ""}${parsed.search || ""}`;
    } else if (parsed.protocol === "urtruck:" || parsed.protocol === "com.urtruck.app:") {
      const hostPart = parsed.hostname ? `/${parsed.hostname}` : "";
      cleaned = `${hostPart}${parsed.pathname || ""}${parsed.search || ""}`;
    }
  } catch {
    // Relative notification path.
  }
  cleaned = cleaned.replace(/^\/+/, '');
  if (!cleaned) return null;
  const [pathPart, queryPart = ""] = cleaned.split("?");
  const segments = pathPart.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  const kind = segments[0].toLowerCase();
  const id = segments[1] || null;
  const params = {};
  if (queryPart) {
    for (const part of queryPart.split("&")) {
      if (!part) continue;
      const [rawK, rawV = ""] = part.split("=");
      if (!rawK) continue;
      try {
        params[decodeURIComponent(rawK)] = decodeURIComponent(rawV);
      } catch {
        params[rawK] = rawV;
      }
    }
  }
  return { kind, id, params };
}

// Deal lifecycle belongs only in the Deals hub. This legacy notification
// center remains available for system/feed notifications and old deep-links,
// but it must never duplicate accepted bids, deal statuses, or deal chat.
function isDealLifecycleNotification(item) {
  const parsed = parseNotifUrl(item?.url);
  if (!parsed) return false;
  return parsed.kind === 'deals' || parsed.kind === 'deal' || parsed.kind === 'chat' || parsed.kind === 'chats';
}

export default function NotificationsScreen({ navigation }) {
  const { session } = useAuth();
  const role = session?.user?.role || 'client';
  const { t, lang } = useI18n();
  const v1 = useV1Colors();
  const s = React.useMemo(() => StyleSheet.create({
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, gap: 10 },
    titleHero: { color: v1.text, fontSize: 19, fontWeight: '700', letterSpacing: -0.2, flexShrink: 1 },
    titleActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    settingsBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: v1.border, backgroundColor: v1.surface, alignItems: 'center', justifyContent: 'center' },
    markAll: { fontSize: 12, fontWeight: '800' },
    card: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
      backgroundColor: v1.surface,
      borderColor: v1.border, borderWidth: 1,
      padding: 14, borderRadius: 10, marginBottom: 8,
      shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    icon: { fontSize: 18, marginTop: 2 },
    title: { color: v1.text, fontSize: 14, marginBottom: 2 },
    body: { color: v1.textMuted, fontSize: 12, lineHeight: 17 },
    time: { color: v1.textDim, fontSize: 11, marginTop: 4 },
    dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  }), [v1]);
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const accent = v1AccentFor(role);

  const load = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) setLoading(true);
    try {
      const d = await notificationsAPI.list(50);
      const all = Array.isArray(d?.notifications) ? d.notifications : [];
      setItems(all.filter(item => !isDealLifecycleNotification(item)));
    } catch {}
    if (showLoading) setLoading(false);
  }, []);

  const { refreshing, onRefresh } = useSafeRefresh(
    useCallback(() => load({ showLoading: false }), [load]),
  );

  useEffect(() => {
    load();
  }, []);

  const markAllRead = async () => {
    await notificationsAPI.readAll();
    notifyNotifRead();
    refreshAppIconBadge();
    toast(`✓ ${t("notif_all_read")}`, "success");
    load();
    notifyNotifRead();
    refreshAppIconBadge();
  };

  const handlePress = async (item) => {
    const isUnread = !item.is_read;
    if (isUnread) {
      try { await notificationsAPI.read(item.id); } catch {}
      notifyNotifRead();
      refreshAppIconBadge();
    }
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_read: 1 } : i)),
    );
    const parsed = parseNotifUrl(item.url);
    if (!parsed) return;
    const { kind, id, params } = parsed;
    try {
      if (kind === "cargos" && id) {
        navigation.navigate("CargoDetail", { cargoId: id, bidId: params.bid || null, role });
      } else if (kind === "trips" && id) {
        navigation.navigate("TripDetail", { tripId: id, bidId: params.bid || null, role });
      } else if (kind === "deals" && id) {
        navigation.navigate("Chat", { dealId: id, role });
      } else if ((kind === "chats" || kind === "chat") && id) {
        navigation.navigate("Chat", { roomId: id, role });
      }
    } catch {}
  };

  const cleanNotifText = (s) => {
    if (!s || typeof s !== "string") return s;
    return s
      .replace(/^None предлагает/, t("notif_driver_offers"))
      .replace(/^None /, "")
      .replace(/^null предлагает/, t("notif_driver_offers"))
      .replace(/^null /, "");
  };

  const renderItem = ({ item }) => {
    const isUnread = !item.is_read;
    const cleanTitle = localizeSystemMessage(cleanNotifText(item.title), lang);
    const cleanBody = localizeSystemMessage(cleanNotifText(item.body), lang);
    return (
      <TouchableOpacity
        style={[s.card, isUnread && { borderColor: accent.main }]}
        onPress={() => handlePress(item)}
      >
        <Text style={s.icon}>{item.icon || "🔔"}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { fontWeight: isUnread ? "700" : "500" }]}>
            {cleanTitle}
          </Text>
          {cleanBody ? <Text style={s.body}>{cleanBody}</Text> : null}
          <Text style={s.time}>{formatNotifTime(item.created_at)}</Text>
        </View>
        {isUnread && <View style={[s.dot, { backgroundColor: accent.main }]} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: v1.bg }]} edges={['top']}>
      <BrandBarWithShare
        onBack={
          navigation.canGoBack?.() ? () => navigation.goBack() : undefined
        }
        accent={accent.main}
        rightSlot={<HeaderMenuButton navigation={navigation} role={role} testID="notifications-menu-btn" />}
      />
      <View style={s.titleRow}>
        <Text style={s.titleHero}>{t('menu_notifications')}</Text>
        <View style={s.titleActions}>
          {items.some(i => !i.is_read) ? (
            <TouchableOpacity onPress={markAllRead} testID="notifications-mark-all-read">
              <Text style={[s.markAll, { color: accent.main }]}>
                {t("notifications_mark_all_read")}
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={s.settingsBtn}
            onPress={() => navigation.navigate('PushFilter', { role })}
            testID="notifications-push-settings"
            accessibilityRole="button"
            accessibilityLabel={t('pushFilter')}
          >
            <Feather name="sliders" size={17} color={v1.text} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={accent.main}
          />
        }
        ListEmptyComponent={
          !loading && !refreshing ? (
            <View style={{ alignItems: "center", paddingVertical: 60 }}>
              <Feather
                name="bell"
                size={48}
                color={v1.textMuted}
                style={{ marginBottom: 10 }}
              />
              <Text style={{ color: v1.textMuted }}>
                {t("notifications_empty")}
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}