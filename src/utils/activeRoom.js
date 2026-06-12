// QA-аудит P2-2: какая комната чата сейчас открыта и в фокусе.
//
// Нужно, чтобы foreground-push о новом сообщении НЕ показывал баннер
// поверх той же комнаты, которую пользователь уже читает (сообщение и
// так придёт поллингом). Для других комнат / других типов уведомлений
// баннер показывается как обычно.
//
// ChatScreen вызывает setActiveRoom(roomId) на focus и setActiveRoom(null)
// на blur/unmount. push-handler читает getActiveRoom().

let activeRoomId = null;

export function setActiveRoom(roomId) {
  activeRoomId = roomId || null;
}

export function getActiveRoom() {
  return activeRoomId;
}
