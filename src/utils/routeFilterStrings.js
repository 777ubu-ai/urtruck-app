// routeFilterStrings — строки Main Route Filter V2.
//
// ПОЧЕМУ ОТДЕЛЬНЫЙ ФАЙЛ, А НЕ src/utils/i18n.js:
// i18n.js — god-node по связности, его импортируют ВСЕ chat-экраны
// (DealWorkspaceScreenV2, composer, voice). §1 ТЗ Task 3 прямо требует: если
// нужен общий файл, затрагивающий Chat/Voice — STOP и зафиксировать как
// integration dependency, не менять самостоятельно. Пока другой агент держит
// физически принятый composer-фикс, дописывать ключи в i18n.js нельзя.
//
// INTEGRATION DEPENDENCY: эти ключи должны быть перенесены в i18n.js
// (все 4 языка) ОДНИМ коммитом после того, как chat-ветка вмёржена.
// До переноса фильтр полностью работает на 4 языках через этот модуль.

const STRINGS = {
  ru: {
    route_from: 'Откуда',
    route_to: 'Куда',
    route_any_where: 'Любая точка',
    route_all_countries: 'Все страны',
    route_search_placeholder: 'Город, страна или погранпереход',
    route_pick_country: 'Выберите страну',
    route_whole_country_hint: 'Весь маршрут по стране',
    route_type_city: 'Города',
    route_type_border: 'Погранпереходы',
    route_type_hub: 'Терминалы и хабы',
    route_empty_title: 'По этому маршруту ничего не найдено',
    route_empty_change: 'Изменить фильтр',
    route_empty_reset: 'Сбросить фильтры',
    route_reset_origin: 'Очистить «Откуда»',
    route_reset_destination: 'Очистить «Куда»',
    route_reset_all: 'Сбросить всё',
    route_search_nothing: 'Ничего не найдено',
    route_error_title: 'Не удалось загрузить',
    route_error_retry: 'Повторить',
    route_back_to_countries: 'Все страны',
  },
  en: {
    route_from: 'From',
    route_to: 'To',
    route_any_where: 'Anywhere',
    route_all_countries: 'All countries',
    route_search_placeholder: 'City, country or border crossing',
    route_pick_country: 'Choose a country',
    route_whole_country_hint: 'Anywhere in the country',
    route_type_city: 'Cities',
    route_type_border: 'Border crossings',
    route_type_hub: 'Terminals and hubs',
    route_empty_title: 'Nothing found for this route',
    route_empty_change: 'Change filter',
    route_empty_reset: 'Reset filters',
    route_reset_origin: 'Clear “From”',
    route_reset_destination: 'Clear “To”',
    route_reset_all: 'Reset all',
    route_search_nothing: 'No matches',
    route_error_title: 'Could not load',
    route_error_retry: 'Retry',
    route_back_to_countries: 'All countries',
  },
  zh: {
    route_from: '起点',
    route_to: '终点',
    route_any_where: '任意地点',
    route_all_countries: '所有国家',
    route_search_placeholder: '城市、国家或口岸',
    route_pick_country: '请选择国家',
    route_whole_country_hint: '该国境内任意地点',
    route_type_city: '城市',
    route_type_border: '口岸',
    route_type_hub: '场站与枢纽',
    route_empty_title: '该线路暂无结果',
    route_empty_change: '修改筛选',
    route_empty_reset: '重置筛选',
    route_reset_origin: '清除「起点」',
    route_reset_destination: '清除「终点」',
    route_reset_all: '全部重置',
    route_search_nothing: '无匹配结果',
    route_error_title: '加载失败',
    route_error_retry: '重试',
    route_back_to_countries: '所有国家',
  },
  kk: {
    route_from: 'Қайдан',
    route_to: 'Қайда',
    route_any_where: 'Кез келген нүкте',
    route_all_countries: 'Барлық елдер',
    route_search_placeholder: 'Қала, ел немесе өткізу бекеті',
    route_pick_country: 'Елді таңдаңыз',
    route_whole_country_hint: 'Ел бойынша кез келген нүкте',
    route_type_city: 'Қалалар',
    route_type_border: 'Өткізу бекеттері',
    route_type_hub: 'Терминалдар мен хабтар',
    route_empty_title: 'Бұл бағыт бойынша ештеңе табылмады',
    route_empty_change: 'Сүзгіні өзгерту',
    route_empty_reset: 'Сүзгіні тазалау',
    route_reset_origin: '«Қайдан» тазалау',
    route_reset_destination: '«Қайда» тазалау',
    route_reset_all: 'Барлығын тазалау',
    route_search_nothing: 'Ештеңе табылмады',
    route_error_title: 'Жүктеу мүмкін болмады',
    route_error_retry: 'Қайталау',
    route_back_to_countries: 'Барлық елдер',
  },
};

export const SUPPORTED_ROUTE_LANGS = Object.keys(STRINGS);

/** Ключи одинаковы во всех языках — иначе UI молча покажет ключ вместо текста. */
export const routeStringKeys = () => Object.keys(STRINGS.ru);

export const routeStrings = (lang) => {
  const raw = String(lang || 'ru').toLowerCase().replace('_', '-').split('-')[0];
  return STRINGS[raw] || STRINGS.ru;
};

/** Суффиксы scope для geoCatalog.routePointLabel (§4/§9). */
export const SCOPE_LABELS = {
  ru: { whole: 'Весь', wholeF: 'Вся', border: 'КПП', hub: 'Хаб' },
  en: { whole: 'All of', wholeF: 'All of', border: 'Border', hub: 'Hub' },
  zh: { whole: '全', wholeF: '全', border: '口岸', hub: '枢纽' },
  kk: { whole: 'Бүкіл', wholeF: 'Бүкіл', border: 'ӨБ', hub: 'Хаб' },
};

export default routeStrings;
