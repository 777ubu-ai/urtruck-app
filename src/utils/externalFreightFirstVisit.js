// Отметка показа привязана к аккаунту на устройстве, не к токену сессии.
export const externalFeedFirstVisitKey = userId => `ur_external_feed_first_visit_v1:${encodeURIComponent(String(userId || ''))}`;

export async function openFirstExternalFeed({ storage, navigation, userId, role, enabled, verified, isCurrent = () => true }) {
  if (!enabled || !verified || !userId || !['driver', 'client'].includes(role) || !isCurrent()) return false;
  const key = externalFeedFirstVisitKey(userId);
  try {
    if (await storage.get(key) === '1' || !isCurrent()) return false;
    // Сохраняем до push: Back/focus не должен снова открыть ленту.
    await storage.set(key, '1');
    if (!isCurrent() || await storage.get(key) !== '1' || !isCurrent()) return false;
    navigation.navigate('ExternalFreightFeed');
    return true;
  } catch {
    // Неудача локального хранилища не мешает входу в основной экран.
    return false;
  }
}
