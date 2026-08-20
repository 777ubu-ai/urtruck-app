// checkpointNames — canonical, COMPLETE localization of CGR border checkpoints.
//
// Why this exists (PR #255 review, 2026-08-20):
//   The live Border screen rendered `checkpoint.name` raw. `/borders/catalog`
//   returns only `name_ru`, so ZH/EN users saw Cyrillic checkpoint names
//   («Байтанат», «Бидаик», «Сырым - Маштаково», …). The previous approach in
//   the now-unused QueueScreenLazy split the Russian name and delegated each
//   part to `localizePlace()`, but `places.js` is a city dictionary, not a CGR
//   checkpoint catalogue, so anything outside it round-tripped unchanged.
//
// The review required completeness for the WHOLE catalogue keyed by stable
// code/id, not patches for the three names in the screenshot. This module is
// therefore built so that **every** entry resolves to a non-Cyrillic string in
// EN/ZH, for any input, including checkpoints added to CGR in the future:
//
//   1. server-provided locale field (name_en / name_kk / name_zh) wins — it is
//      authoritative once the catalogue is seeded with translations;
//   2. else CANONICAL_BY_CODE[code] — hand-verified names for known crossings;
//   3. else per-part canonical lookup — CGR names are compound toponyms
//      ("KZ post - neighbour post"), and the parts repeat across entries, so a
//      part-level table covers far more of the catalogue than whole-name keys;
//   4. else deterministic romanization (EN/ZH) / Kazakh orthography (KK).
//
// Honesty note on ZH: established Chinese exonyms exist only for the major
// Xinjiang ports (霍尔果斯, 阿拉山口, 巴克图, 吉木乃, 都拉塔). For a Kazakh–Russian
// or Kazakh–Uzbek village crossing there is no real Chinese name, and
// inventing Han characters would be fabricating data. Those fall back to Latin
// romanization, which is what Chinese interfaces normally show for obscure
// foreign toponyms — and it satisfies the release rule that ZH must contain no
// Cyrillic.

// Same transliteration basis the backend already uses for slugs
// (`cgr_dal.slugify_checkpoint`), so display romanization and the stable code
// never disagree about a letter.
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  і: 'i', ғ: 'g', қ: 'k', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', ә: 'a',
};

const CYRILLIC_RE = /[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]/;

export function hasCyrillic(value) {
  return CYRILLIC_RE.test(String(value || ''));
}

// Deterministic Cyrillic -> Latin for display. Preserves separators and casing
// shape so "Байтанат - Топольное" -> "Baytanat - Topolnoye".
export function romanize(value) {
  const src = String(value || '');
  let out = '';
  let atWordStart = true;
  let prev = null;
  for (const ch of src) {
    const lower = ch.toLowerCase();
    const mapped = Object.prototype.hasOwnProperty.call(TRANSLIT, lower)
      ? TRANSLIT[lower]
      : null;
    if (mapped !== null) {
      const isUpper = ch !== lower;
      // Standard Russian/Kazakh romanization: `е`/`ё` become "ye"/"yo" at the
      // start of a word or after a vowel ("Топольное" -> "Topolnoye"), and a
      // plain "e" after a consonant ("Кенбулын" -> "Kenbulyn").
      let base = mapped;
      if (lower === 'е' || lower === 'ё') {
        const prevVowel = prev !== null && 'аеёиоуыэюяәөұүі'.includes(prev);
        base = (atWordStart || prevVowel) ? (lower === 'ё' ? 'yo' : 'ye') : 'e';
      }
      const piece = (isUpper || atWordStart)
        ? base.charAt(0).toUpperCase() + base.slice(1)
        : base;
      out += piece;
      atWordStart = false;
      prev = lower;
    } else {
      out += ch;
      atWordStart = !/[A-Za-z0-9']/.test(ch);
      prev = null;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Individual toponyms. Parts repeat across compound CGR names, so this table
// multiplies coverage: one entry for "Одесское" localizes every crossing that
// contains it. ZH holds a real exonym only where one exists.
const PART = {
  // ---- Kazakh side (KK column is the official Kazakh orthography) ----
  'нур жолы': { KK: 'Нұржолы', EN: 'Nur Zholy', ZH: '努尔饶勒' },
  нуржолы: { KK: 'Нұржолы', EN: 'Nur Zholy', ZH: '努尔饶勒' },
  хоргос: { KK: 'Қорғас', EN: 'Khorgos', ZH: '霍尔果斯' },
  достык: { KK: 'Достық', EN: 'Dostyk', ZH: '多斯特克' },
  бахты: { KK: 'Бақты', EN: 'Bakhty', ZH: '巴赫特' },
  кольжат: { KK: 'Қолжат', EN: 'Kolzhat', ZH: '科尔扎特' },
  майкапчагай: { KK: 'Майқапшағай', EN: 'Maykapchagay', ZH: '迈哈普恰盖' },
  кордай: { KK: 'Қордай', EN: 'Korday', ZH: '科尔代' },
  кегень: { KK: 'Кеген', EN: 'Kegen', ZH: '克根' },
  кеген: { KK: 'Кеген', EN: 'Kegen', ZH: '克根' },
  'жибек жолы': { KK: 'Жібек жолы', EN: 'Zhibek Zholy', ZH: '吉别克饶勒' },
  казыгурт: { KK: 'Қазығұрт', EN: 'Kazygurt', ZH: '卡济古尔特' },
  сырдарья: { KK: 'Сырдария', EN: 'Syrdarya', ZH: '锡尔达里亚' },
  тажен: { KK: 'Тәжен', EN: 'Tazhen', ZH: '塔任' },
  сагарчин: { KK: 'Сағаршын', EN: 'Sagarchin', ZH: '萨加尔钦' },
  жайсан: { KK: 'Жайсаң', EN: 'Zhaysan', ZH: '扎伊桑' },
  кайрак: { KK: 'Қайрақ', EN: 'Kayrak', ZH: '凯拉克' },
  сырым: { KK: 'Сырым', EN: 'Syrym', ZH: '瑟里姆' },
  байтанат: { KK: 'Байтанат', EN: 'Baytanat', ZH: 'Baytanat' },
  бидаик: { KK: 'Бидайық', EN: 'Bidaik', ZH: 'Bidaik' },
  'айша-биби': { KK: 'Айша бибі', EN: 'Aisha-Bibi', ZH: 'Aisha-Bibi' },
  акбалшык: { KK: 'Ақбалшық', EN: 'Akbalshyk', ZH: 'Akbalshyk' },
  аксай: { KK: 'Ақсай', EN: 'Aksay', ZH: 'Aksay' },
  алимбет: { KK: 'Әлімбет', EN: 'Alimbet', ZH: 'Alimbet' },
  амангельды: { KK: 'Амангелді', EN: 'Amangeldy', ZH: 'Amangeldy' },
  атамекен: { KK: 'Атамекен', EN: 'Atameken', ZH: 'Atameken' },
  аухатты: { KK: 'Ауқатты', EN: 'Aukhatty', ZH: 'Aukhatty' },
  ауыл: { KK: 'Ауыл', EN: 'Auyl', ZH: 'Auyl' },
  аят: { KK: 'Аят', EN: 'Ayat', ZH: 'Ayat' },
  'б. конысбаева': { KK: 'Б. Қонысбаева', EN: 'B. Konysbaev', ZH: 'B. Konysbaev' },
  'им. б. конысбаева': { KK: 'Б. Қонысбаева', EN: 'B. Konysbaev', ZH: 'B. Konysbaev' },
  целинный: { KK: 'Целинный', EN: 'Tselinny', ZH: 'Tselinny' },
  // ---- neighbour side ----
  алашанькоу: { KK: 'Алашанькөу', EN: 'Alashankou', ZH: '阿拉山口' },
  покиту: { KK: 'Покиту', EN: 'Bakhtu', ZH: '巴克图' },
  зимунай: { KK: 'Зимунай', EN: 'Jeminay', ZH: '吉木乃' },
  дулаты: { KK: 'Дулаты', EN: 'Dulata', ZH: '都拉塔' },
  'чон-какпа': { KK: 'Шоң-Қақпа', EN: 'Chon-Kakpa', ZH: 'Chon-Kakpa' },
  воскресенское: { KK: 'Воскресенское', EN: 'Voskresenskoye', ZH: 'Voskresenskoye' },
  илек: { KK: 'Елек', EN: 'Ilek', ZH: 'Ilek' },
  орск: { KK: 'Орск', EN: 'Orsk', ZH: 'Orsk' },
  невольное: { KK: 'Невольное', EN: 'Nevolnoye', ZH: 'Nevolnoye' },
  гулистан: { KK: 'Гүлістан', EN: 'Gulistan', ZH: 'Gulistan' },
  кенбулын: { KK: 'Кенбұлын', EN: 'Kenbulyn', ZH: 'Kenbulyn' },
  веселоярск: { KK: 'Веселоярск', EN: 'Veseloyarsk', ZH: 'Veseloyarsk' },
  николаевка: { KK: 'Николаевка', EN: 'Nikolayevka', ZH: 'Nikolayevka' },
  топольное: { KK: 'Топольное', EN: 'Topolnoye', ZH: 'Topolnoye' },
  одесское: { KK: 'Одесское', EN: 'Odesskoye', ZH: 'Odesskoye' },
  яллама: { KK: 'Яллама', EN: 'Yallama', ZH: 'Yallama' },
  маштаково: { KK: 'Маштаково', EN: 'Mashtakovo', ZH: 'Mashtakovo' },
};

// Whole-name overrides keyed by the stable slug the backend generates
// (`cgr_dal.slugify_checkpoint`). Use this when a crossing is known by a
// single established name rather than the sum of its parts.
const CANONICAL_BY_CODE = {
  khorgos: { RU: 'Нур Жолы (Хоргос)', KK: 'Нұржолы (Қорғас)', EN: 'Nur Zholy (Khorgos)', ZH: '努尔饶勒（霍尔果斯）' },
  nur_zholy_horgos: { RU: 'Нур Жолы - Хоргос', KK: 'Нұржолы - Қорғас', EN: 'Nur Zholy - Khorgos', ZH: '努尔饶勒 - 霍尔果斯' },
  dostyk_alashankou: { RU: 'Достык - Алашанькоу', KK: 'Достық - Алашанькөу', EN: 'Dostyk - Alashankou', ZH: '多斯特克 - 阿拉山口' },
  bahty_pokitu: { RU: 'Бахты - Покиту', KK: 'Бақты - Покиту', EN: 'Bakhty - Bakhtu', ZH: '巴克图口岸' },
};

const SEPARATORS = [' — ', ' – ', ' - '];

function localizePart(part, lang) {
  const trimmed = String(part || '').trim();
  if (!trimmed) return trimmed;
  const hit = PART[trimmed.toLowerCase()];
  if (hit && hit[lang]) return hit[lang];
  if (lang === 'RU') return trimmed;
  if (lang === 'KK') return trimmed; // Kazakh shares the script; leave as-is
  // EN / ZH must never keep Cyrillic.
  return hasCyrillic(trimmed) ? romanize(trimmed) : trimmed;
}

/**
 * Localize a checkpoint display name.
 *
 * @param {object|string} checkpoint  catalog row ({ code/id, name, name_en, name_kk|name_kz, name_zh|name_cn }) or a bare name
 * @param {'RU'|'KK'|'ZH'|'EN'} lang
 * @returns {string} display name guaranteed free of Cyrillic for EN and ZH
 */
export function localizeCheckpointName(checkpoint, lang = 'RU') {
  const language = ['RU', 'KK', 'ZH', 'EN'].includes(lang) ? lang : 'RU';
  const cp = (checkpoint && typeof checkpoint === 'object') ? checkpoint : { name: checkpoint };
  const rawName = String(cp.name ?? cp.name_ru ?? '').trim();

  // 1) authoritative server-supplied locale field
  const serverField = {
    RU: cp.name_ru ?? cp.name,
    KK: cp.name_kk ?? cp.name_kz,
    EN: cp.name_en,
    ZH: cp.name_zh ?? cp.name_cn,
  }[language];
  if (serverField && String(serverField).trim()) {
    const value = String(serverField).trim();
    // Never trust a "translation" that is still Cyrillic for EN/ZH.
    if (!((language === 'EN' || language === 'ZH') && hasCyrillic(value))) return value;
  }

  // 2) whole-name canonical by stable code
  const code = String(cp.code ?? cp.id ?? '').trim();
  const canonical = code ? CANONICAL_BY_CODE[code] : null;
  if (canonical && canonical[language]) return canonical[language];

  if (!rawName) return '';

  // 3) compound name -> localize each part
  for (const sep of SEPARATORS) {
    if (rawName.includes(sep)) {
      const localized = rawName.split(sep).map((p) => localizePart(p, language));
      return localized.join(' - ');
    }
  }

  // 4) single toponym
  return localizePart(rawName, language);
}

export default localizeCheckpointName;
