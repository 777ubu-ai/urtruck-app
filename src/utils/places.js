// Централизованный словарь городов, погранпереходов и системных категорий.
//
// Legacy production-данные местами хранят точки маршрута свободным текстом
// по-русски и даже с emoji-флагом внутри строки. Presentation layer обязан
// нормализовать такие значения перед показом. С 16.08.2026 продуктовая
// политика однозначна: при locale=ZH известные города/переходы показываются
// на китайском; при EN — на английском. Пользовательский свободный текст,
// которого нет в справочнике, не переводится автоматически.

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
  'Чжэнчжоу':          { zh: '郑州', en: 'Zhengzhou' },
  'Сиань':             { zh: '西安', en: "Xi'an" },
  'Кашгар':            { zh: '喀什', en: 'Kashgar' },
  'Маньчжурия':        { zh: '满洲里', en: 'Manzhouli' },
  'Манчжурия':         { zh: '满洲里', en: 'Manzhouli' },
  'Ланьчжоу':          { zh: '兰州', en: 'Lanzhou' },
  'Иньчуань':          { zh: '银川', en: 'Yinchuan' },
  'Хух-Хото':          { zh: '呼和浩特', en: 'Hohhot' },
  'Нинбо':             { zh: '宁波', en: 'Ningbo' },
  'Циньхуандао':       { zh: '秦皇岛', en: 'Qinhuangdao' },
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
  'Оренбург':          { zh: '奥伦堡', en: 'Orenburg' },
  'Сочи':              { zh: '索契', en: 'Sochi' },
  // ─── Узбекистан ───
  'Ташкент':           { zh: '塔什干', en: 'Tashkent' },
  'Самарканд':         { zh: '撒马尔罕', en: 'Samarkand' },
  'Бухара':            { zh: '布哈拉', en: 'Bukhara' },
  'Андижан':           { zh: '安集延', en: 'Andijan' },
  'Наманган':          { zh: '纳曼干', en: 'Namangan' },
  'Фергана':           { zh: '费尔干纳', en: 'Fergana' },
  'Нукус':             { zh: '努库斯', en: 'Nukus' },
  'Термез':            { zh: '铁尔梅兹', en: 'Termez' },
  'Карши':             { zh: '卡尔希', en: 'Karshi' },
  // ─── Кыргызстан ───
  'Бишкек':            { zh: '比什凯克', en: 'Bishkek' },
  'Ош':                { zh: '奥什', en: 'Osh' },
  'Каракол':           { zh: '卡拉科尔', en: 'Karakol' },
  'Нарын':             { zh: '纳林', en: 'Naryn' },
  'Токмок':            { zh: '托克莫克', en: 'Tokmok' },
  // ─── Таджикистан / Туркменистан ───
  'Душанбе':           { zh: '杜尚别', en: 'Dushanbe' },
  'Худжанд':           { zh: '苦盏', en: 'Khujand' },
  'Куляб':             { zh: '库洛布', en: 'Kulob' },
  'Ашхабад':           { zh: '阿什哈巴德', en: 'Ashgabat' },
  'Туркменабад':       { zh: '土库曼纳巴德', en: 'Turkmenabat' },
  'Туркменбаши':       { zh: '土库曼巴希', en: 'Turkmenbashi' },
  // ─── Беларусь / Турция / ЕС / ОАЭ ───
  'Минск':             { zh: '明斯克', en: 'Minsk' },
  'Брест':             { zh: '布列斯特', en: 'Brest' },
  'Стамбул':           { zh: '伊斯坦布尔', en: 'Istanbul' },
  'Анкара':            { zh: '安卡拉', en: 'Ankara' },
  'Ереван':            { zh: '埃里温', en: 'Yerevan' },
  'Тбилиси':           { zh: '第比利斯', en: 'Tbilisi' },
  'Батуми':            { zh: '巴统', en: 'Batumi' },
  'Поти':              { zh: '波季', en: 'Poti' },
  'Баку':              { zh: '巴库', en: 'Baku' },
  'Гянджа':            { zh: '甘贾', en: 'Ganja' },
  'Измир':             { zh: '伊兹密尔', en: 'Izmir' },
  'Мерсин':            { zh: '梅尔辛', en: 'Mersin' },
  'Ризе':              { zh: '里泽', en: 'Rize' },
  'Гамбург':           { zh: '汉堡', en: 'Hamburg' },
  'Берлин':            { zh: '柏林', en: 'Berlin' },
  'Мюнхен':            { zh: '慕尼黑', en: 'Munich' },
  'Франкфурт':         { zh: '法兰克福', en: 'Frankfurt' },
  'Варшава':           { zh: '华沙', en: 'Warsaw' },
  'Дуйсбург':          { zh: '杜伊斯堡', en: 'Duisburg' },
  'Роттердам':         { zh: '鹿特丹', en: 'Rotterdam' },
  'Антверпен':         { zh: '安特卫普', en: 'Antwerp' },
  'Лодзь':             { zh: '罗兹', en: 'Lodz' },
  'Вроцлав':           { zh: '弗罗茨瓦夫', en: 'Wroclaw' },
  'Малашевиче':        { zh: '马拉舍维奇', en: 'Malaszewicze' },
  'Прага':             { zh: '布拉格', en: 'Prague' },
  'Будапешт':          { zh: '布达佩斯', en: 'Budapest' },
  'Гданьск':           { zh: '格但斯克', en: 'Gdansk' },
  'Познань':           { zh: '波兹南', en: 'Poznan' },
  'Малашевичи':        { zh: '马拉舍维奇', en: 'Malaszewicze' },
  'Малашевичи (терминал)': { zh: '马拉舍维奇（终端）', en: 'Malaszewicze terminal' },
  'Хелм (Chelm)':       { zh: '海乌姆（Chelm）', en: 'Chelm' },
  'Каунасский ТКЛ':     { zh: '考纳斯运输物流中心', en: 'Kaunas transport logistics centre' },
  'СЭЗ Хоргос-Восточные ворота': { zh: '霍尔果斯-东方大门经济特区', en: 'Khorgos - Eastern Gate SEZ' },
  'Сухой порт Урумчи':  { zh: '乌鲁木齐陆港', en: 'Urumqi dry port' },
  'Порт Поти':          { zh: '波季港', en: 'Port of Poti' },
  'Порт Мерсин':        { zh: '梅尔辛港', en: 'Port of Mersin' },
  'Вильнюс':           { zh: '维尔纽斯', en: 'Vilnius' },
  'Каунас':            { zh: '考纳斯', en: 'Kaunas' },
  'Клайпеда':          { zh: '克莱佩达', en: 'Klaipeda' },
  'Рига':              { zh: '里加', en: 'Riga' },
  'Лиепая':            { zh: '利耶帕亚', en: 'Liepaja' },
  'Таллин':            { zh: '塔林', en: 'Tallinn' },
  'Бухарест':          { zh: '布加勒斯特', en: 'Bucharest' },
  'Констанца':         { zh: '康斯坦察', en: 'Constanta' },
  'Братислава':        { zh: '布拉迪斯拉发', en: 'Bratislava' },
  'Кошице':            { zh: '科希策', en: 'Kosice' },
  'София':             { zh: '索非亚', en: 'Sofia' },
  'Варна':             { zh: '瓦尔纳', en: 'Varna' },
  'Афины':             { zh: '雅典', en: 'Athens' },
  'Пирей':             { zh: '比雷埃夫斯', en: 'Piraeus' },
  'Салоники':          { zh: '塞萨洛尼基', en: 'Thessaloniki' },
  'Талдыкорган':       { zh: '塔尔迪库尔干', en: 'Taldykorgan' },
  'Қарасу':            { zh: '卡拉苏', en: 'Karasu' },
  'Тегеран':           { zh: '德黑兰', en: 'Tehran' },
  'Дубай':             { zh: '迪拜', en: 'Dubai' },
  'Алашанькоу-сухой порт': { zh: '阿拉山口陆港', en: 'Alashankou dry port' },
};

const ARROW_RE = /([↔→←⇄]+)/;
const FLAG_PAIR_RE = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;

/**
 * Удаляет legacy-декорации из значения точки маршрута. Флаг — отдельная
 * UI-сущность и не должен жить внутри city string. Для ZH/EN это также
 * предотвращает «Иу, 🇨🇳 + ещё один 🇨🇳» при отдельном countryFlag().
 */
export function cleanPlaceName(raw) {
  if (!raw) return raw;
  return String(raw)
    .replace(FLAG_PAIR_RE, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*$/, '')
    .trim();
}

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
 * Локализует известные города/переходы. ZH и EN обязательно получают
 * словарное название. Для RU/KK сохраняется исходная строка.
 */
export function localizePlace(raw, lang) {
  const l = String(lang || '').toLowerCase();
  if (!raw) return raw;
  // Always remove legacy presentation decorations first. RU/KK previously
  // returned raw DB text, so a city stored as "Иу, 🇨🇳" plus countryFlag(CN)
  // rendered two flags for the same point. Flags are a UI entity, never data.
  const clean = cleanPlaceName(raw);
  if (l !== 'zh' && l !== 'en') return clean;
  return localizeHead(clean, l);
}

// ─── Типы груза ───
const CARGO_DICT = {
  'Одежда и текстиль':            { zh: '服装纺织品',   en: 'Clothing & textiles' },
  'Одежда':                       { zh: '服装',        en: 'Clothing' },
  'Текстиль':                     { zh: '纺织品',      en: 'Textiles' },
  'Текстиль и одежда':            { zh: '纺织品和服装', en: 'Textiles & clothing' },
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
  'Строительные материалы':       { zh: '建筑材料',     en: 'Construction materials' },
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
  'Бытовая химия':                { zh: '日化用品',     en: 'Household chemicals' },
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
  'Мотоциклы':                    { zh: '摩托车',      en: 'Motorcycles' },
  'Металлическая посуда':         { zh: '金属餐具',    en: 'Metal tableware' },
  'Посуда металлическая':         { zh: '金属餐具',    en: 'Metal tableware' },
  'Холодильники':                 { zh: '冰箱',        en: 'Refrigerators' },
  'Детские стулья':               { zh: '儿童椅',      en: "Children's chairs" },
};

const CARGO_INDEX = Object.fromEntries(
  Object.entries(CARGO_DICT).map(([key, value]) => [key.toLocaleLowerCase('ru-RU'), value]),
);

export function localizeCargoName(raw, lang) {
  const l = String(lang || '').toLowerCase();
  if (!raw || (l !== 'zh' && l !== 'en')) return raw;
  const key = String(raw).trim();
  const e = CARGO_DICT[key] || CARGO_INDEX[key.toLocaleLowerCase('ru-RU')];
  return (e && e[l]) ? e[l] : raw;
}

export const hasPlaceTranslation = (raw, lang = 'ZH') => {
  const l = String(lang || '').toLowerCase();
  const clean = cleanPlaceName(raw);
  if (!clean) return false;
  if (ARROW_RE.test(clean)) {
    return clean.split(ARROW_RE)
      .filter((part) => !ARROW_RE.test(part) && part.trim())
      .every((part) => Boolean(DICT[part.trim()]?.[l]));
  }
  return Boolean(DICT[clean]?.[l]);
};

export { DICT, CARGO_DICT };
