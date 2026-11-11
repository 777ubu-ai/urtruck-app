// Только системное событие истечения собственного объявления. Остальные
// уведомления, в том числе текст пользователей, сохраняют исходное содержимое.
const COPY = {
  RU: ['Срок публикации истёк', 'Объявление сохранено в личной истории.'],
  KK: ['Жариялау мерзімі аяқталды', 'Хабарландыру жеке тарихта сақталды.'],
  EN: ['Publication period expired', 'The listing remains in your history.'],
  ZH: ['发布期限已过', '信息已保存在个人历史记录中。'],
  TR: ['İlanın yayın süresi doldu', 'İlan kişisel geçmişinizde saklandı.'],
  UZ: ['Eʼlonning joylashtirish muddati tugadi', 'Eʼlon shaxsiy tarixingizda saqlandi.'],
  KY: ['Жарыялоонун мөөнөтү аяктады', 'Жарыя жеке тарыхыңызда сакталды.'],
  TG: ['Муҳлати нашри эълон ба охир расид', 'Эълон дар таърихи шахсии шумо нигоҳ дошта шуд.'],
  BE: ['Тэрмін публікацыі аб’явы скончыўся', 'Аб’ява захавана ў вашай асабістай гісторыі.'],
};

export function localizeExpiryNotification(item, language) {
  if (item?.type !== 'listing_lifecycle' || !/^listing-expired:(cargo|trip):/.test(item?.event_key || '')) return item;
  const copy = COPY[String(language || '').toUpperCase()] || COPY.EN;
  return { ...item, title: copy[0], body: copy[1] };
}
