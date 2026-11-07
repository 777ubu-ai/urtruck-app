// История сохраняет исходный статус; ручной повторной публикации здесь нет.
export const isOwnedHistory = (item, isDriver) =>
  !!item.status && item.status !== 'active' && !(isDriver && item.status === 'draft');
