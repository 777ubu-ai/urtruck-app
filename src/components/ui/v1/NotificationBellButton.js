import React from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { notificationsAPI } from '../../../utils/notificationsAPI';
import { subscribeNotifRead } from '../../../utils/unreadEvents';
import { useV1Colors } from '../../../theme/designV1';

const POLL_MS = 12000;

export default function NotificationBellButton({
  navigation,
  color,
  testID = 'notification-bell-btn',
}) {
  const colors = useV1Colors();
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    let mounted = true;
    let timer = null;
    const refresh = async () => {
      try {
        const res = await notificationsAPI.attention();
        const next = Number(res?.total_attention || 0);
        if (mounted) setCount(Number.isFinite(next) ? Math.max(0, next) : 0);
      } catch {
        if (mounted) setCount(0);
      }
    };
    refresh();
    timer = setInterval(refresh, POLL_MS);
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const unreadSub = subscribeNotifRead(refresh);
    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
      appSub?.remove?.();
      unreadSub?.();
    };
  }, []);

  const badgeText = count > 99 ? '99+' : String(count);
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('Notifications')}
      style={s.btn}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Уведомления"
    >
      <Feather name="bell" size={21} color={color || colors.text} />
      {count > 0 ? (
        <View style={s.badge} testID={`${testID}-badge`}>
          <Text style={s.badgeText}>{badgeText}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: 3,
    top: 3,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E23D28',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 11,
  },
});
