export const EXTERNAL_FREIGHT_CARD_ACTIONS = {
  RU: { show: 'Показать', less: 'Свернуть', whatsapp: 'Написать автору в WhatsApp', unavailable: 'WhatsApp недоступен: нет международного номера' },
  KK: { show: 'Көрсету', less: 'Жию', whatsapp: 'Авторға WhatsApp арқылы жазу', unavailable: 'WhatsApp қолжетімсіз: халықаралық нөмір жоқ' },
  EN: { show: 'Show', less: 'Collapse', whatsapp: 'Message author on WhatsApp', unavailable: 'WhatsApp unavailable: no international number' },
  ZH: { show: '显示', less: '收起', whatsapp: '通过 WhatsApp 联系发布者', unavailable: '没有国际号码，无法打开 WhatsApp' },
  TR: { show: 'Göster', less: 'Daralt', whatsapp: 'İlan sahibine WhatsApp’tan yaz', unavailable: 'Uluslararası numara yok; WhatsApp kullanılamıyor' },
  UZ: { show: 'Ko‘rsatish', less: 'Yig‘ish', whatsapp: 'Muallifga WhatsApp orqali yozish', unavailable: 'Xalqaro raqam yo‘q; WhatsApp mavjud emas' },
  KY: { show: 'Көрсөтүү', less: 'Жыйуу', whatsapp: 'Авторго WhatsApp аркылуу жазуу', unavailable: 'Эл аралык номер жок; WhatsApp жеткиликсиз' },
  TG: { show: 'Нишон додан', less: 'Ҷамъ кардан', whatsapp: 'Ба муаллиф дар WhatsApp навиштан', unavailable: 'Рақами байналмилалӣ нест; WhatsApp дастнорас аст' },
  BE: { show: 'Паказаць', less: 'Згарнуць', whatsapp: 'Напісаць аўтару ў WhatsApp', unavailable: 'Няма міжнароднага нумара; WhatsApp недаступны' },
};

export function externalFreightCardActions(lang) {
  return EXTERNAL_FREIGHT_CARD_ACTIONS[lang] || EXTERNAL_FREIGHT_CARD_ACTIONS.EN;
}
