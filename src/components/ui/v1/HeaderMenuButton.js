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
import { TouchableOpacity, StyleSheet } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { useV1Colors } from "../../../theme/designV1";

export default function HeaderMenuButton({
  navigation,
  role,
  color,
  testID = "header-menu-btn",
}) {
  const colors = useV1Colors();
  return (
    <TouchableOpacity
      onPress={() =>
        navigation.navigate("Profile", role ? { role } : undefined)
      }
      style={s.btn}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel="Профиль и меню"
    >
      <Feather name="menu" size={24} color={color || colors.text} />
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
});
