// HeaderMenuButton — единая кнопка ☰ (top-right) для входа в Профиль/меню.
//
// Паттерн inDrive / Yandex Go: профиль и настройки открываются из «гамбургера»
// в правом верхнем углу как pushed-экран, а не как вкладка таб-бара. Ставится
// в шапку всех основных вкладок (Лента, Мои рейсы, Очередь, Чаты, Сделки),
// чтобы доступ к профилю был всегда под рукой и одинаковый.
//
// Роль передаётся дальше в Profile, чтобы экран открылся в нужной теме
// (driver — изумруд, client — янтарь). Работает и для гостя: маршрут Profile
// зарегистрирован и в гостевом стеке (показывает приглашение зарегистрироваться).

import React from "react";
import { TouchableOpacity, StyleSheet, View, Text } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useV1Colors } from "../../../theme/designV1";
import { useAuth } from "../../../utils/AuthContext";
import { useUnreadNotifications } from "../../../utils/useUnreadNotifications";

export default function HeaderMenuButton({
  navigation,
  role,
  color,
  testID = "header-menu-btn",
}) {
  const colors = useV1Colors();
  const { hasToken } = useAuth();
  const unread = useUnreadNotifications(hasToken);
  const visible = Number(unread) > 0;
  const label = Number(unread) > 9 ? "9+" : String(unread);
  return (
    <TouchableOpacity
      onPress={() =>
        navigation.navigate("Profile", role ? { role } : undefined)
      }
      style={s.btn}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={
        visible
          ? `Профиль и меню, ${unread} непрочитанных уведомлений`
          : "Профиль и меню"
      }
    >
      <Feather name="menu" size={24} color={color || colors.text} />
      {visible ? (
        <View
          style={[
            s.badge,
            { backgroundColor: colors.error, borderColor: colors.bg },
          ]}
          testID="header-menu-unread-badge"
        >
          <Text style={s.badgeText}>{label}</Text>
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
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  badgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
});
