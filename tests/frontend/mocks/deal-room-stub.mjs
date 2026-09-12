// Минимальный мок components/deal/DealRoom.js для gray-box-рендера
// DealStatusTimeline.js под plain Node: у Timeline нужен только
// systemEventText, а реальный DealRoom тянет ../TruckMap (нативный
// модуль с платформенными вариантами), который в Node не резолвится.
export const systemEventText = (t, ev) => {
  const status = ev?.payload?.status || ev?.status || '';
  return status ? `event:${status}` : 'event';
};

export default { systemEventText };
