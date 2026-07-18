// Словарь городов и погранпереходов для локализации маршрутов.
//
// Названия городов лежат в базе свободным текстом по-русски («Хоргос»,
// «Ташкент», «Нур Жолы ↔ Хоргос»). Ярлыки интерфейса переводит t(), а вот
// эти данные — нет. Здесь мы переводим ИЗВЕСТНЫЕ города на язык интерфейса
// мгновенно и оффлайн. Имена собственные (водители) и произвольный текст
// не трогаем — только совпадения по справочнику.
//
// Ключ — русское каноническое имя. Для kk оставляем русское написание
// (казахские названия городов в кириллице практически совпадают), поэтому
// заполняем только zh и en — там, где отличие реально важно пользователю.

const DICT = {
  // ─── Казахстан ───
  'Алматы':            { zh: '阿拉木图', en: 'Almaty' },
  'Астана':            { zh: '阿斯塔纳', en: 'Astana' },
  'Нур-Султан':        { zh: '阿斯塔纳', en: 'Astana' },
  'Шымкент':           { zh: '奇姆肯特', en: 'Shymkent' },
  'Караганда':         { zh: '卡拉干达', en: 'Karaganda' },
  'Актобе':            { zh: '阿克托别', en: 'Aktobe' },
  'Атырау':            { zh: '阿特劳', en: 'Atyrau' },
  'Усть-Каменогорск':  { zh: '乌斯季卡缅诺戈尔斯克', en: 'Oskemen' },
  'Павлодар':          { zh: '巴甫洛达尔', en: 'Pavlodar' },
  'Семей':             { zh: '塞梅伊', en: 'Semey' },
  'Тараз':             { zh: '塔拉兹', en: 'Taraz' },
  'Костанай':          { zh: '科斯塔奈', en: 'Kostanay' },
  'Кызылорда':         { zh: '克孜勒奥尔达', en: 'Kyzylorda' },
  'Уральск':           { zh: '乌拉尔斯克', en: 'Oral' },
  'Актау':             { zh: '阿克套', en: 'Aktau' },
  'Петропавловск':     { zh: '彼得罗巴甫洛夫斯克', en: 'Petropavl' },
  'Кокшетау':          { zh: '科克舍套', en: 'Kokshetau' },
  // ─── Погранпереходы КЗ ↔ КНР ───
  'Хоргос':            { zh: '霍尔果斯', en: 'Khorgos' },
  'Нур Жолы':          { zh: '努尔饶勒', en: 'Nur Zholy' },
  'Нур жолы':          { zh: '努尔饶勒', en: 'Nur Zholy' },
  'Достык':            { zh: '多斯特克', en: 'Dostyk' },
  'Алашанькоу':        { zh: '阿拉山口', en: 'Alashankou' },
  'Майкапчагай':       { zh: '迈卡普恰盖', en: 'Maykapshagay' },
  'Зимунай':           { zh: '吉木乃', en: 'Jeminay' },
  'Джеминай':          { zh: '吉木乃', en: 'Jeminay' },
  'Бахты':             { zh: '巴克图', en: 'Bakhty' },
  'Тачэн':             { zh: '塔城', en: 'Tacheng' },
  'Чугучак':           { zh: '塔城', en: 'Chuguchak' },
  'Калжат':            { zh: '喀勒扎特', en: 'Kalzhat' },
  'Дулаты':            { zh: '都拉塔', en: 'Dulaty' },
  'Покиту':            { zh: '博克图', en: 'Pokitu' },
  'Хоргос (Хуэйэрго)': { zh: '霍尔果斯', en: 'Khorgos' },
  // ─── Китай ───
  'Иу':                { zh: '义乌', en: 'Yiwu' },
  'Гуанчжоу':          { zh: '广州', en: 'Guangzhou' },
  'Шэньчжэнь':         { zh: '深圳', en: 'Shenzhen' },
  'Пекин':             { zh: '北京', en: 'Beijing' },
  'Шанхай':            { zh: '上海', en: 'Shanghai' },
  'Ханчжоу':           { zh: '杭州', en: 'Hangzhou' },
  'Урумчи':            { zh: '乌鲁木齐', en: 'Urumqi' },
  'Циндао':            { zh: '青岛', en: 'Qingdao' },
  'Чэнду':             { zh: '成都', en: 'Chengdu' },
  'Чунцин':            { zh: '重庆', en: 'Chongqing' },
  'Тяньцзинь':         { zh: '天津', en: 'Tianjin' },
  // ─── Россия ───
  'Москва':            { zh: '莫斯科', en: 'Moscow' },
  'Санкт-Петербург':   { zh: '圣彼得堡', en: 'Saint Petersburg' },
  'Новосибирск':       { zh: '新西伯利亚', en: 'Novosibirsk' },
  'Екатеринбург':      { zh: '叶卡捷琳堡', en: 'Yekaterinburg' },
  'Казань':            { zh: '喀山', en: 'Kazan' },
  'Нижний Новгород':   { zh: '下诺夫哥罗德', en: 'Nizhny Novgorod' },
  'Челябинск':         { zh: '车里雅宾斯克', en: 'Chelyabinsk' },
  'Самара':            { zh: '萨马拉', en: 'Samara' },
  'Омск':              { zh: '鄂木斯克', en: 'Omsk' },
  'Уфа':               { zh: '乌法', en: 'Ufa' },
  'Красноярск':        { zh: '克拉斯诺亚尔斯克', en: 'Krasnoyarsk' },
  'Воронеж':           { zh: '沃罗涅日', en: 'Voronezh' },
  'Волгоград':         { zh: '伏尔加格勒', en: 'Volgograd' },
  'Ростов-на-Дону':    { zh: '顿河畔罗斯托夫', en: 'Rostov-on-Don' },
  'Краснодар':         { zh: '克拉斯诺达尔', en: 'Krasnodar' },
  'Иркутск':           { zh: '伊尔库茨克', en: 'Irkutsk' },
  'Владивосток':       { zh: '符拉迪沃斯托克', en: 'Vladivostok' },
  'Хабаровск':         { zh: '哈巴罗夫斯克', en: 'Khabarovsk' },
  // ─── Узбекистан ───
  'Ташкент':           { zh: '塔什干', en: 'Tashkent' },
  'Самарканд':         { zh: '撒马尔罕', en: 'Samarkand' },
  'Бухара':            { zh: '布哈拉', en: 'Bukhara' },
  'Андижан':           { zh: '安集延', en: 'Andijan' },
  'Наманган':          { zh: '纳曼干', en: 'Namangan' },
  'Фергана':           { zh: '费尔干纳', en: 'Fergana' },
  'Нукус':             { zh: '努库斯', en: 'Nukus' },
  // ─── Кыргызстан ───
  'Бишкек':            { zh: '比什凯克', en: 'Bishkek' },
  'Ош':                { zh: '奥什', en: 'Osh' },
  'Каракол':           { zh: '卡拉科尔', en: 'Karakol' },
  // ─── Таджикистан / Туркменистан ───
  'Душанбе':           { zh: '杜尚别', en: 'Dushanbe' },
  'Худжанд':           { zh: '苦盏', en: 'Khujand' },
  'Ашхабад':           { zh: '阿什哈巴德', en: 'Ashgabat' },
  // ─── Беларусь / Турция / ЕС / ОАЭ ───
  'Минск':             { zh: '明斯克', en: 'Minsk' },
  'Брест':             { zh: '布列斯特', en: 'Brest' },
  'Стамбул':           { zh: '伊斯坦布尔', en: 'Istanbul' },
  'Анкара':            { zh: '安卡拉', en: 'Ankara' },
  'Гамбург':           { zh: '汉堡', en: 'Hamburg' },
  'Берлин':            { zh: '柏林', en: 'Berlin' },
  'Мюнхен':            { zh: '慕尼黑', en: 'Munich' },
  'Варшава':           { zh: '华沙', en: 'Warsaw' },
  'Дубай':             { zh: '迪拜', en: 'Dubai' },
  // ─── Составные названия переходов (целым ключом — с дефисом внутри) ───
  'Алашанькоу-сухой порт': { zh: '阿拉山口陆港', en: 'Alashankou dry port' },
};

// Стрелочные разделители в составных названиях («Нур Жолы ↔ Хоргос»).
// Дефис СЮДА не входит намеренно — иначе «Ростов-на-Дону» распадётся;
// дефисные названия ищем целым ключом.
const ARROW_RE = /([↔→←⇄]+)/;

function localizeHead(head, lang) {
  const key = head.trim();
  const full = DICT[key];
  if (full && full[lang]) return head.replace(key, full[lang]);
  if (ARROW_RE.test(head)) {
    return head.split(ARROW_RE).map((part) => {
      const k = part.trim();
      const e = k && DICT[k];
      return (e && e[lang]) ? part.replace(k, e[lang]) : part;
    }).join('');
  }
  return head;
}

/**
 * Локализует свободный текст места на язык интерфейса по справочнику.
 * Известные города заменяются, флаги/эмодзи/страна и неизвестный текст
 * сохраняются как есть. Для ru/kk возвращаем исходную строку (там названия
 * и так кириллицей).
 *
 * @param {string} raw  — «Нур Жолы ↔ Хоргос, 🇰🇿»
 * @param {string} lang — 'ru' | 'kk' | 'zh' | 'en'
 */
export function localizePlace(raw, lang) {
  // getLanguage()/useI18n отдают код в ВЕРХНЕМ регистре (RU/KK/ZH/EN),
  // а словарь — по 'zh'/'en'. Нормализуем, иначе локализация не срабатывает.
  const l = String(lang || '').toLowerCase();
  if (!raw || (l !== 'zh' && l !== 'en')) return raw;
  const s = String(raw);
  const ci = s.indexOf(',');           // отделяем «, 🇰🇿» / «, страна»
  const head = ci >= 0 ? s.slice(0, ci) : s;
  const tail = ci >= 0 ? s.slice(ci) : '';
  return localizeHead(head, l) + tail;
}

// ─── Типы груза (для перевода «Обувь» и т.п. на карточках) ───
// Ключ — русское название из BASE_CARGO_TYPES (src/utils/cargoTypes.js).
// Кастомные (свободный текст, набранные пользователем) не переводятся.
const CARGO_DICT = {
  'Одежда и текстиль':            { zh: '服装纺织品',   en: 'Clothing & textiles' },
  'Обувь':                        { zh: '鞋类',        en: 'Footwear' },
  'Электроника':                  { zh: '电子产品',     en: 'Electronics' },
  'Бытовая техника':              { zh: '家用电器',     en: 'Home appliances' },
  'Компьютеры и офисная техника': { zh: '电脑办公设备', en: 'Computers & office equipment' },
  'Электросамокаты':              { zh: '电动滑板车',   en: 'Electric scooters' },
  'LED-панели':                   { zh: 'LED面板',     en: 'LED panels' },
  'Автозапчасти':                 { zh: '汽车配件',     en: 'Auto parts' },
  'Шины и диски':                 { zh: '轮胎轮毂',     en: 'Tires & wheels' },
  'Автомобили':                   { zh: '汽车',        en: 'Cars' },
  'Стройматериалы':               { zh: '建筑材料',     en: 'Construction materials' },
  'Металл и арматура':            { zh: '金属钢筋',     en: 'Metal & rebar' },
  'Трубы':                        { zh: '管材',        en: 'Pipes' },
  'Цемент':                       { zh: '水泥',        en: 'Cement' },
  'Плитка керамическая':          { zh: '陶瓷砖',      en: 'Ceramic tiles' },
  'Мебель':                       { zh: '家具',        en: 'Furniture' },
  'Продукты питания':             { zh: '食品',        en: 'Food products' },
  'Мясо говяжье':                 { zh: '牛肉',        en: 'Beef' },
  'Овощи и фрукты':               { zh: '蔬菜水果',     en: 'Vegetables & fruits' },
  'Мёд':                          { zh: '蜂蜜',        en: 'Honey' },
  'Зерно':                        { zh: '粮食',        en: 'Grain' },
  'Напитки':                      { zh: '饮料',        en: 'Beverages' },
  'Медикаменты':                  { zh: '药品',        en: 'Medicines' },
  'Косметика':                    { zh: '化妆品',       en: 'Cosmetics' },
  'Игрушки':                      { zh: '玩具',        en: 'Toys' },
  'Спорттовары':                  { zh: '体育用品',     en: 'Sports goods' },
  'Книги и канцелярия':           { zh: '图书文具',     en: 'Books & stationery' },
  'Бумажная продукция':           { zh: '纸制品',      en: 'Paper products' },
  'Химия (бытовая)':              { zh: '日化用品',     en: 'Household chemicals' },
  'Удобрения':                    { zh: '化肥',        en: 'Fertilizers' },
  'Сельхоз техника':              { zh: '农业机械',     en: 'Agricultural machinery' },
  'Оборудование промышленное':    { zh: '工业设备',     en: 'Industrial equipment' },
  'Товары для дома':              { zh: '家居用品',     en: 'Home goods' },
  'Посуда':                       { zh: '餐具',        en: 'Tableware' },
  'Оптовые товары из Китая':      { zh: '中国批发商品', en: 'Wholesale goods from China' },
  'Ткани рулонные':               { zh: '卷装面料',     en: 'Roll fabrics' },
  'Лом металла':                  { zh: '废金属',      en: 'Scrap metal' },
  'Бумага для принтера':          { zh: '打印纸',      en: 'Printer paper' },
  'Упаковка':                     { zh: '包装',        en: 'Packaging' },
};

/**
 * Локализует известный тип груза на язык интерфейса. Кастомный (свободный
 * пользовательский текст) и ru/kk возвращаются как есть.
 */
export function localizeCargoName(raw, lang) {
  const l = String(lang || '').toLowerCase();
  if (!raw || (l !== 'zh' && l !== 'en')) return raw;
  const e = CARGO_DICT[String(raw).trim()];
  return (e && e[l]) ? e[l] : raw;
}

export { DICT, CARGO_DICT };
