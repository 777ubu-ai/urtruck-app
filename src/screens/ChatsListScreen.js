import React from 'react';
import DealsScreen from './DealsScreen';

// P0 2026-09-02 §2/§3/§15 — LegacyChatsListScreen БОЛЬШЕ НЕ ПОДКЛЮЧАЕТСЯ.
// Она содержала 3 старые вкладки `deals-tab-offers/active/archive` и
// оставалась живой альтернативной ветвью (route.name !== 'Deals'), из-за
// чего чаты для standalone-маршрутов (ChatsList, deep links) продолжали
// показывать регрессировавший UI.
//
// Канон 2026-09-02:
//   Чаты живут ВНУТРИ сделок. Вкладок "Чаты" нет. Deep link на ChatsList
//   ведёт в тот же самый unified inbox, что и bottom-tab «Сделки».
//
// LegacyChatsListScreen.js остаётся на диске как исторический артефакт до
// плановой чистки (§15 legacy-map), но не импортируется. Тесты §2/§3 ловят
// возврат старых testID.
export default function ChatsListScreen(props) {
  return <DealsScreen {...props} />;
}
