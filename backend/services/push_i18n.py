"""System-generated push notification text, localized by recipient device
locale (push-recovery closure track, 2026-09-09; expanded to 16 locales in
the i18n-16 track, 2026-09-12).

ONLY system text (fixed titles/phrases below) is translated here. User-
generated content — chat message text, cargo/trip free-form descriptions,
comments — must NEVER be passed through push_text(); callers interpolate
those as opaque parameters (route, amount) into an already-localized
template, never translate them.

Wording for shared concepts (deal status labels, "bid accepted/rejected",
"counter-offer") is kept consistent with the app's existing UI translations
in src/utils/i18n.js (deal_event_status_*, bid_accepted/bid_rejected,
counter_offer) so a driver/shipper sees the same vocabulary in a push as in
the app itself — not a fresh, differently-worded translation.

I18N-16 (2026-09-12): SUPPORTED_LOCALES/normalize_locale now mirror the
16-locale registry in src/utils/localeRegistry.js exactly (same 16 codes,
same "no flag/country coupling" rule — item 9 of the i18n expansion spec).
DEFAULT_LOCALE changed from "RU" to "EN": the previous RU default meant an
unrecognized/missing device locale for a driver in, say, Poland or Germany
silently received Russian push text — exactly the "silent fallback to
Russian for international users" item 2 of that spec forbids. EN is now
the universal floor, matching src/utils/i18n.js's own t()/translate()
contract for every non-RU locale.
"""
from typing import Optional

SUPPORTED_LOCALES = (
    "RU", "EN", "ZH", "KK", "UZ", "KY", "TG", "DE",
    "FR", "PL", "LT", "LV", "IT", "TR", "BE", "RO",
)
DEFAULT_LOCALE = "EN"

# BCP-47 (or legacy country-code) -> our internal code. Keys are matched
# against the FULL lowercased raw value first, then against its base
# subtag (the part before the first '-'). This mirrors LANG_ALIAS in
# src/utils/i18n.js so a locale reported by the same device resolves to
# the same code on both frontend and backend. Per item 9 of the i18n
# expansion spec, this maps *language* subtags, never a country/region
# alone: 'kz' and 'cn' below are grandfathered legacy-country aliases for
# two languages that predate the 16-locale expansion (matching
# i18n.js's own LEGACY_LANG_FIX), not a general country->language rule —
# no such alias exists for any of the 12 newly added locales.
_LOCALE_ALIASES = {
    "ru": "RU", "rus": "RU",
    "en": "EN", "eng": "EN",
    "kk": "KK", "kaz": "KK", "kz": "KK",
    "zh": "ZH", "zh-cn": "ZH", "zh-hans": "ZH", "zh-hant": "ZH", "zh-tw": "ZH", "zh-hk": "ZH", "cn": "ZH",
    "uz": "UZ", "uz-latn": "UZ",
    "ky": "KY", "kir": "KY", "kg": "KY",
    "tg": "TG", "tgk": "TG",
    "de": "DE", "deu": "DE", "ger": "DE",
    "fr": "FR", "fra": "FR", "fre": "FR",
    "pl": "PL", "pol": "PL",
    "lt": "LT", "lit": "LT",
    "lv": "LV", "lav": "LV",
    "it": "IT", "ita": "IT",
    "tr": "TR", "tur": "TR",
    "be": "BE", "bel": "BE",
    "ro": "RO", "ron": "RO", "rum": "RO",
}


def normalize_locale(raw: Optional[str]) -> str:
    """Accepts app-native codes (e.g. 'RU'/'DE'/'UZ') or BCP-47-ish values a
    client might report (Localization.getLocales(), e.g. 'ru-RU', 'zh-Hans-CN',
    'de-CH', 'en-US') and maps them onto one of the 16 codes the app
    supports. A region subtag never drives the mapping by itself (item 9)
    — 'de-CH' resolves via the 'de' base subtag to DE, not by inferring
    anything from 'CH'. Unknown/missing -> DEFAULT_LOCALE (EN), never RU,
    matching src/utils/i18n.js's own fallback for any unsupported locale.
    """
    if not raw:
        return DEFAULT_LOCALE
    code = str(raw).strip().lower()
    if code in _LOCALE_ALIASES:
        return _LOCALE_ALIASES[code]
    base = code.split("-")[0]
    if base in _LOCALE_ALIASES:
        return _LOCALE_ALIASES[base]
    return DEFAULT_LOCALE


# event -> locale -> (title, body) with {named} placeholders for the ONLY
# things a caller is allowed to interpolate: route/amount/reason-style
# opaque values, never free text.
TEMPLATES: dict[str, dict[str, tuple[str, str]]] = {
    "bid_created": {
        "RU": ("📋 Новая ставка", "{amount} за {route}"),
        "KK": ("📋 Жаңа баға", "{route} үшін {amount}"),
        "ZH": ("📋 新报价", "{route}：{amount}"),
        "EN": ("📋 New bid", "{amount} for {route}"),
        "UZ": ("📋 Yangi taklif", "{route} uchun {amount}"),
        "KY": ("📋 Жаңы сунуш", "{route} үчүн {amount}"),
        "TG": ("📋 Пешниҳоди нав", "{amount} барои {route}"),
        "DE": ("📋 Neues Angebot", "{amount} für {route}"),
        "FR": ("📋 Nouvelle offre", "{amount} pour {route}"),
        "PL": ("📋 Nowa oferta", "{amount} za {route}"),
        "LT": ("📋 Naujas pasiūlymas", "{amount} už {route}"),
        "LV": ("📋 Jauns piedāvājums", "{amount} par {route}"),
        "IT": ("📋 Nuova offerta", "{amount} per {route}"),
        "TR": ("📋 Yeni teklif", "{route} için {amount}"),
        "BE": ("📋 Новая стаўка", "{amount} за {route}"),
        "RO": ("📋 Ofertă nouă", "{amount} pentru {route}"),
    },
    "bid_accepted": {
        "RU": ("✅ Ставка принята!", "Ваше предложение {amount} принято! Сделка создана."),
        "KK": ("✅ Баға қабылданды!", "Сіздің {amount} ұсынысыңыз қабылданды! Мәміле жасалды."),
        "ZH": ("✅ 报价已接受！", "您的 {amount} 报价已被接受！交易已创建。"),
        "EN": ("✅ Bid accepted!", "Your offer of {amount} was accepted! Deal created."),
        "UZ": ("✅ Taklif qabul qilindi!", "Sizning {amount} taklifingiz qabul qilindi! Bitim yaratildi."),
        "KY": ("✅ Сунуш кабыл алынды!", "Сиздин {amount} сунушуңуз кабыл алынды! Бүтүм түзүлдү."),
        "TG": ("✅ Пешниҳод қабул шуд!", "Пешниҳоди шумо ба маблағи {amount} қабул шуд! Созиш сохта шуд."),
        "DE": ("✅ Angebot angenommen!", "Ihr Angebot über {amount} wurde angenommen! Geschäft erstellt."),
        "FR": ("✅ Offre acceptée !", "Votre offre de {amount} a été acceptée ! Transaction créée."),
        "PL": ("✅ Oferta zaakceptowana!", "Twoja oferta {amount} została zaakceptowana! Transakcja utworzona."),
        "LT": ("✅ Pasiūlymas priimtas!", "Jūsų pasiūlymas {amount} priimtas! Sandoris sudarytas."),
        "LV": ("✅ Piedāvājums pieņemts!", "Jūsu piedāvājums {amount} tika pieņemts! Darījums izveidots."),
        "IT": ("✅ Offerta accettata!", "La tua offerta di {amount} è stata accettata! Affare creato."),
        "TR": ("✅ Teklif kabul edildi!", "{amount} tutarındaki teklifiniz kabul edildi! Anlaşma oluşturuldu."),
        "BE": ("✅ Стаўка прынята!", "Ваша прапанова {amount} прынята! Здзелка створана."),
        "RO": ("✅ Ofertă acceptată!", "Oferta dumneavoastră de {amount} a fost acceptată! Tranzacție creată."),
    },
    "bid_rejected": {
        "RU": ("❌ Ставка отклонена", "Ваше предложение {amount} отклонено владельцем."),
        "KK": ("❌ Баға қабылданбады", "Сіздің {amount} ұсынысыңызды иесі қабылдамады."),
        "ZH": ("❌ 报价被拒绝", "您的 {amount} 报价已被货主拒绝。"),
        "EN": ("❌ Bid rejected", "Your offer of {amount} was rejected by the owner."),
        "UZ": ("❌ Taklif rad etildi", "Sizning {amount} taklifingiz egasi tomonidan rad etildi."),
        "KY": ("❌ Сунуш четке кагылды", "Сиздин {amount} сунушуңуз ээси тарабынан четке кагылды."),
        "TG": ("❌ Пешниҳод рад шуд", "Пешниҳоди шумо ба маблағи {amount} аз ҷониби соҳиб рад шуд."),
        "DE": ("❌ Angebot abgelehnt", "Ihr Angebot über {amount} wurde vom Eigentümer abgelehnt."),
        "FR": ("❌ Offre refusée", "Votre offre de {amount} a été refusée par le propriétaire."),
        "PL": ("❌ Oferta odrzucona", "Twoja oferta {amount} została odrzucona przez właściciela."),
        "LT": ("❌ Pasiūlymas atmestas", "Jūsų pasiūlymą {amount} atmetė savininkas."),
        "LV": ("❌ Piedāvājums noraidīts", "Jūsu piedāvājumu {amount} noraidīja īpašnieks."),
        "IT": ("❌ Offerta rifiutata", "La tua offerta di {amount} è stata rifiutata dal proprietario."),
        "TR": ("❌ Teklif reddedildi", "{amount} tutarındaki teklifiniz sahibi tarafından reddedildi."),
        "BE": ("❌ Стаўка адхілена", "Ваша прапанова {amount} адхілена ўладальнікам."),
        "RO": ("❌ Ofertă respinsă", "Oferta dumneavoastră de {amount} a fost respinsă de proprietar."),
    },
    "bid_countered": {
        "RU": ("🔁 Встречная цена", "Новая встречная цена: {amount}."),
        "KK": ("🔁 Қарсы баға", "Жаңа қарсы баға: {amount}."),
        "ZH": ("🔁 还价", "新的还价：{amount}。"),
        "EN": ("🔁 Counter-offer", "New counter-offer: {amount}."),
        "UZ": ("🔁 Qarshi narx", "Yangi qarshi narx: {amount}."),
        "KY": ("🔁 Каршы баа", "Жаңы каршы баа: {amount}."),
        "TG": ("🔁 Нархи муқобил", "Нархи нави муқобил: {amount}."),
        "DE": ("🔁 Gegenangebot", "Neues Gegenangebot: {amount}."),
        "FR": ("🔁 Contre-offre", "Nouvelle contre-offre : {amount}."),
        "PL": ("🔁 Kontroferta", "Nowa kontroferta: {amount}."),
        "LT": ("🔁 Priešpasiūlymas", "Naujas priešpasiūlymas: {amount}."),
        "LV": ("🔁 Pretpiedāvājums", "Jauns pretpiedāvājums: {amount}."),
        "IT": ("🔁 Controfferta", "Nuova controfferta: {amount}."),
        "TR": ("🔁 Karşı teklif", "Yeni karşı teklif: {amount}."),
        "BE": ("🔁 Сустрэчная цана", "Новая сустрэчная цана: {amount}."),
        "RO": ("🔁 Contraofertă", "Contraofertă nouă: {amount}."),
    },
    "bid_counter_cancelled": {
        "RU": ("↩️ Встречная цена отменена", "Исходная ставка {amount} снова активна."),
        "KK": ("↩️ Қарсы баға болдырылмады", "Бастапқы баға {amount} қайта белсенді."),
        "ZH": ("↩️ 还价已取消", "原报价 {amount} 已重新生效。"),
        "EN": ("↩️ Counter-offer cancelled", "Your original bid {amount} is active again."),
        "UZ": ("↩️ Qarshi narx bekor qilindi", "Boshlang'ich taklif {amount} yana faol."),
        "KY": ("↩️ Каршы баа жокко чыгарылды", "Баштапкы сунуш {amount} кайра активдүү."),
        "TG": ("↩️ Нархи муқобил бекор шуд", "Пешниҳоди аслӣ {amount} боз фаъол аст."),
        "DE": ("↩️ Gegenangebot storniert", "Ihr ursprüngliches Angebot über {amount} ist wieder aktiv."),
        "FR": ("↩️ Contre-offre annulée", "Votre offre initiale de {amount} est de nouveau active."),
        "PL": ("↩️ Kontroferta anulowana", "Twoja pierwotna oferta {amount} jest ponownie aktywna."),
        "LT": ("↩️ Priešpasiūlymas atšauktas", "Jūsų pradinis pasiūlymas {amount} vėl aktyvus."),
        "LV": ("↩️ Pretpiedāvājums atcelts", "Jūsu sākotnējais piedāvājums {amount} atkal ir aktīvs."),
        "IT": ("↩️ Controfferta annullata", "La tua offerta originale di {amount} è di nuovo attiva."),
        "TR": ("↩️ Karşı teklif iptal edildi", "İlk teklifiniz {amount} yeniden aktif."),
        "BE": ("↩️ Сустрэчная цана скасавана", "Зыходная стаўка {amount} зноў актыўная."),
        "RO": ("↩️ Contraofertă anulată", "Oferta dumneavoastră inițială de {amount} este din nou activă."),
    },
    "bid_cancelled": {
        "RU": ("↩️ Ставка отозвана", "Предложение {amount} отозвано автором."),
        "KK": ("↩️ Баға кері қайтарылды", "{amount} ұсынысын авторы кері қайтарды."),
        "ZH": ("↩️ 报价已撤回", "{amount} 报价已被发布者撤回。"),
        "EN": ("↩️ Bid withdrawn", "The offer of {amount} was withdrawn by its author."),
        "UZ": ("↩️ Taklif qaytarib olindi", "{amount} taklifi muallifi tomonidan qaytarib olindi."),
        "KY": ("↩️ Сунуш кайтарылды", "{amount} сунушу автору тарабынан кайтарылды."),
        "TG": ("↩️ Пешниҳод бозгардонида шуд", "Пешниҳоди {amount} аз ҷониби муаллиф бозгардонида шуд."),
        "DE": ("↩️ Angebot zurückgezogen", "Das Angebot über {amount} wurde vom Ersteller zurückgezogen."),
        "FR": ("↩️ Offre retirée", "L'offre de {amount} a été retirée par son auteur."),
        "PL": ("↩️ Oferta wycofana", "Oferta {amount} została wycofana przez autora."),
        "LT": ("↩️ Pasiūlymas atšauktas", "Pasiūlymą {amount} atšaukė jo autorius."),
        "LV": ("↩️ Piedāvājums atsaukts", "Piedāvājumu {amount} atsauca tā autors."),
        "IT": ("↩️ Offerta ritirata", "L'offerta di {amount} è stata ritirata dal suo autore."),
        "TR": ("↩️ Teklif geri çekildi", "{amount} teklifi yazarı tarafından geri çekildi."),
        "BE": ("↩️ Стаўка адклікана", "Прапанова {amount} адклікана аўтарам."),
        "RO": ("↩️ Ofertă retrasă", "Oferta de {amount} a fost retrasă de autorul ei."),
    },
    "bid_withdrawn": {
        "RU": ("📋 Объявление снято", "Ваша ставка больше не активна."),
        "KK": ("📋 Хабарландыру алынды", "Сіздің бағаңыз енді белсенді емес."),
        "ZH": ("📋 信息已下架", "您的报价已不再有效。"),
        "EN": ("📋 Listing withdrawn", "Your bid is no longer active."),
        "UZ": ("📋 E'lon olib tashlandi", "Sizning taklifingiz endi faol emas."),
        "KY": ("📋 Жарыя алынды", "Сиздин сунушуңуз мындан ары активдүү эмес."),
        "TG": ("📋 Эълон бардошта шуд", "Пешниҳоди шумо дигар фаъол нест."),
        "DE": ("📋 Anzeige zurückgezogen", "Ihr Angebot ist nicht mehr aktiv."),
        "FR": ("📋 Annonce retirée", "Votre offre n'est plus active."),
        "PL": ("📋 Ogłoszenie wycofane", "Twoja oferta nie jest już aktywna."),
        "LT": ("📋 Skelbimas pašalintas", "Jūsų pasiūlymas nebeaktyvus."),
        "LV": ("📋 Sludinājums noņemts", "Jūsu piedāvājums vairs nav aktīvs."),
        "IT": ("📋 Annuncio rimosso", "La tua offerta non è più attiva."),
        "TR": ("📋 İlan kaldırıldı", "Teklifiniz artık aktif değil."),
        "BE": ("📋 Аб'ява знята", "Ваша стаўка больш не актыўная."),
        "RO": ("📋 Anunț retras", "Oferta dumneavoastră nu mai este activă."),
    },
    "deal_status_in_progress": {
        "RU": ("🚛 Рейс начался", "{route}"),
        "KK": ("🚛 Рейс басталды", "{route}"),
        "ZH": ("🚛 运输开始", "{route}"),
        "EN": ("🚛 Shipment started", "{route}"),
        "UZ": ("🚛 Reys boshlandi", "{route}"),
        "KY": ("🚛 Рейс башталды", "{route}"),
        "TG": ("🚛 Рейс оғоз ёфт", "{route}"),
        "DE": ("🚛 Fahrt begonnen", "{route}"),
        "FR": ("🚛 Trajet commencé", "{route}"),
        "PL": ("🚛 Trasa rozpoczęta", "{route}"),
        "LT": ("🚛 Kelionė prasidėjo", "{route}"),
        "LV": ("🚛 Brauciens sākies", "{route}"),
        "IT": ("🚛 Viaggio iniziato", "{route}"),
        "TR": ("🚛 Sefer başladı", "{route}"),
        "BE": ("🚛 Рэйс пачаўся", "{route}"),
        "RO": ("🚛 Cursa a început", "{route}"),
    },
    "deal_status_at_border": {
        "RU": ("🛂 Груз на границе", "{route}"),
        "KK": ("🛂 Жүк шекарада", "{route}"),
        "ZH": ("🛂 货物在边境", "{route}"),
        "EN": ("🛂 Cargo at border", "{route}"),
        "UZ": ("🛂 Yuk chegarada", "{route}"),
        "KY": ("🛂 Жүк чекте", "{route}"),
        "TG": ("🛂 Бор дар марз", "{route}"),
        "DE": ("🛂 Fracht an der Grenze", "{route}"),
        "FR": ("🛂 Fret à la frontière", "{route}"),
        "PL": ("🛂 Ładunek na granicy", "{route}"),
        "LT": ("🛂 Krovinys prie sienos", "{route}"),
        "LV": ("🛂 Krava pie robežas", "{route}"),
        "IT": ("🛂 Carico al confine", "{route}"),
        "TR": ("🛂 Yük sınırda", "{route}"),
        "BE": ("🛂 Груз на мяжы", "{route}"),
        "RO": ("🛂 Marfă la frontieră", "{route}"),
    },
    "deal_status_delivered": {
        "RU": ("✅ Груз доставлен", "{route}"),
        "KK": ("✅ Жүк жеткізілді", "{route}"),
        "ZH": ("✅ 货物已送达", "{route}"),
        "EN": ("✅ Cargo delivered", "{route}"),
        "UZ": ("✅ Yuk yetkazildi", "{route}"),
        "KY": ("✅ Жүк жеткирилди", "{route}"),
        "TG": ("✅ Бор расонида шуд", "{route}"),
        "DE": ("✅ Fracht zugestellt", "{route}"),
        "FR": ("✅ Fret livré", "{route}"),
        "PL": ("✅ Ładunek dostarczony", "{route}"),
        "LT": ("✅ Krovinys pristatytas", "{route}"),
        "LV": ("✅ Krava piegādāta", "{route}"),
        "IT": ("✅ Carico consegnato", "{route}"),
        "TR": ("✅ Yük teslim edildi", "{route}"),
        "BE": ("✅ Груз дастаўлены", "{route}"),
        "RO": ("✅ Marfă livrată", "{route}"),
    },
    "deal_status_received": {
        "RU": ("✅ Получение подтверждено", "{route}"),
        "KK": ("✅ Жүк қабылданды", "{route}"),
        "ZH": ("✅ 已确认收货", "{route}"),
        "EN": ("✅ Receipt confirmed", "{route}"),
        "UZ": ("✅ Qabul tasdiqlandi", "{route}"),
        "KY": ("✅ Алуу ырасталды", "{route}"),
        "TG": ("✅ Қабул тасдиқ шуд", "{route}"),
        "DE": ("✅ Empfang bestätigt", "{route}"),
        "FR": ("✅ Réception confirmée", "{route}"),
        "PL": ("✅ Odbiór potwierdzony", "{route}"),
        "LT": ("✅ Gavimas patvirtintas", "{route}"),
        "LV": ("✅ Saņemšana apstiprināta", "{route}"),
        "IT": ("✅ Ricezione confermata", "{route}"),
        "TR": ("✅ Teslim alma onaylandı", "{route}"),
        "BE": ("✅ Атрыманне пацверджана", "{route}"),
        "RO": ("✅ Primire confirmată", "{route}"),
    },
    "deal_status_completed": {
        "RU": ("🤝 Сделка завершена", "{route}"),
        "KK": ("🤝 Мәміле аяқталды", "{route}"),
        "ZH": ("🤝 交易已完成", "{route}"),
        "EN": ("🤝 Deal completed", "{route}"),
        "UZ": ("🤝 Bitim yakunlandi", "{route}"),
        "KY": ("🤝 Бүтүм аякталды", "{route}"),
        "TG": ("🤝 Созиш анҷом ёфт", "{route}"),
        "DE": ("🤝 Geschäft abgeschlossen", "{route}"),
        "FR": ("🤝 Transaction terminée", "{route}"),
        "PL": ("🤝 Transakcja zakończona", "{route}"),
        "LT": ("🤝 Sandoris užbaigtas", "{route}"),
        "LV": ("🤝 Darījums pabeigts", "{route}"),
        "IT": ("🤝 Affare concluso", "{route}"),
        "TR": ("🤝 Anlaşma tamamlandı", "{route}"),
        "BE": ("🤝 Здзелка завершана", "{route}"),
        "RO": ("🤝 Tranzacție finalizată", "{route}"),
    },
    "deal_status_cancelled": {
        "RU": ("❌ Сделка отменена", "{route}"),
        "KK": ("❌ Мәміле бас тартылды", "{route}"),
        "ZH": ("❌ 交易已取消", "{route}"),
        "EN": ("❌ Deal cancelled", "{route}"),
        "UZ": ("❌ Bitim bekor qilindi", "{route}"),
        "KY": ("❌ Бүтүм жокко чыгарылды", "{route}"),
        "TG": ("❌ Созиш бекор шуд", "{route}"),
        "DE": ("❌ Geschäft storniert", "{route}"),
        "FR": ("❌ Transaction annulée", "{route}"),
        "PL": ("❌ Transakcja anulowana", "{route}"),
        "LT": ("❌ Sandoris atšauktas", "{route}"),
        "LV": ("❌ Darījums atcelts", "{route}"),
        "IT": ("❌ Affare annullato", "{route}"),
        "TR": ("❌ Anlaşma iptal edildi", "{route}"),
        "BE": ("❌ Здзелка скасавана", "{route}"),
        "RO": ("❌ Tranzacție anulată", "{route}"),
    },
    "tracking_request": {
        "RU": ("📍 Запрос GPS-отслеживания", "Грузоотправитель просит показать местоположение машины по сделке."),
        "KK": ("📍 GPS-бақылау сұрауы", "Жүк жөнелтуші мәміле бойынша көліктің орналасқан жерін көрсетуді сұрайды."),
        "ZH": ("📍 GPS 追踪请求", "货主请求查看本次交易的车辆位置。"),
        "EN": ("📍 GPS tracking request", "The shipper is asking to see the truck's location for this deal."),
        "UZ": ("📍 GPS-kuzatuv so'rovi", "Yuk egasi bitim bo'yicha mashina joylashuvini ko'rsatishni so'rayapti."),
        "KY": ("📍 GPS-байкоо суроо-талабы", "Жүк ээси бүтүм боюнча унаанын жайгашкан жерин көрсөтүүнү суранып жатат."),
        "TG": ("📍 Дархости пайгирии GPS", "Соҳиби бор мепурсад, ки ҷойгиршавии мошинро дар доираи созиш нишон диҳед."),
        "DE": ("📍 GPS-Ortungsanfrage", "Der Frachteigentümer bittet um den Standort des LKW für dieses Geschäft."),
        "FR": ("📍 Demande de suivi GPS", "Le propriétaire du fret demande à voir la position du camion pour cette transaction."),
        "PL": ("📍 Prośba o śledzenie GPS", "Właściciel ładunku prosi o pokazanie lokalizacji ciężarówki dla tej transakcji."),
        "LT": ("📍 GPS sekimo užklausa", "Krovinio savininkas prašo parodyti sunkvežimio vietą šiam sandoriui."),
        "LV": ("📍 GPS izsekošanas pieprasījums", "Kravas īpašnieks lūdz parādīt kravas auto atrašanās vietu šim darījumam."),
        "IT": ("📍 Richiesta di localizzazione GPS", "Il proprietario del carico chiede di vedere la posizione del camion per questo affare."),
        "TR": ("📍 GPS takip talebi", "Yük sahibi bu anlaşma için kamyonun konumunu görmek istiyor."),
        "BE": ("📍 Запыт GPS-адсочвання", "Уладальнік груза просіць паказаць месцазнаходжанне машыны па здзелцы."),
        "RO": ("📍 Cerere de urmărire GPS", "Proprietarul mărfii cere să vadă locația camionului pentru această tranzacție."),
    },
    "tracking_approved": {
        "RU": ("📍 GPS-отслеживание включено", "Водитель разрешил показывать местоположение машины."),
        "KK": ("📍 GPS-бақылау қосылды", "Жүргізуші көліктің орналасқан жерін көрсетуге рұқсат берді."),
        "ZH": ("📍 GPS 追踪已开启", "司机已允许显示车辆位置。"),
        "EN": ("📍 GPS tracking enabled", "The driver allowed sharing the truck's location."),
        "UZ": ("📍 GPS-kuzatuv yoqildi", "Haydovchi mashina joylashuvini ko'rsatishga ruxsat berdi."),
        "KY": ("📍 GPS-байкоо күйгүзүлдү", "Айдоочу унаанын жайгашкан жерин көрсөтүүгө уруксат берди."),
        "TG": ("📍 Пайгирии GPS фаъол шуд", "Ронанда иҷозат дод, ки ҷойгиршавии мошин нишон дода шавад."),
        "DE": ("📍 GPS-Ortung aktiviert", "Der Fahrer hat erlaubt, den Standort des LKW anzuzeigen."),
        "FR": ("📍 Suivi GPS activé", "Le chauffeur a autorisé le partage de la position du camion."),
        "PL": ("📍 Śledzenie GPS włączone", "Kierowca zezwolił na pokazywanie lokalizacji ciężarówki."),
        "LT": ("📍 GPS sekimas įjungtas", "Vairuotojas leido rodyti sunkvežimio vietą."),
        "LV": ("📍 GPS izsekošana ieslēgta", "Vadītājs atļāva rādīt kravas auto atrašanās vietu."),
        "IT": ("📍 Localizzazione GPS attivata", "L'autista ha autorizzato la condivisione della posizione del camion."),
        "TR": ("📍 GPS takibi açıldı", "Sürücü kamyonun konumunun gösterilmesine izin verdi."),
        "BE": ("📍 GPS-адсочванне ўключана", "Кіроўца дазволіў паказваць месцазнаходжанне машыны."),
        "RO": ("📍 Urmărire GPS activată", "Șoferul a permis afișarea locației camionului."),
    },
    "tracking_declined": {
        "RU": ("📍 GPS-отслеживание отклонено", "Водитель не разрешил передачу геопозиции."),
        "KK": ("📍 GPS-бақылау қабылданбады", "Жүргізуші геолокацияны беруге рұқсат бермеді."),
        "ZH": ("📍 GPS 追踪被拒绝", "司机未同意共享位置信息。"),
        "EN": ("📍 GPS tracking declined", "The driver did not allow sharing location."),
        "UZ": ("📍 GPS-kuzatuv rad etildi", "Haydovchi geolokatsiyani uzatishga ruxsat bermadi."),
        "KY": ("📍 GPS-байкоо четке кагылды", "Айдоочу геолокацияны берүүгө уруксат берген жок."),
        "TG": ("📍 Пайгирии GPS рад шуд", "Ронанда ба интиқоли геомавқеият иҷозат надод."),
        "DE": ("📍 GPS-Ortung abgelehnt", "Der Fahrer hat die Standortfreigabe nicht erlaubt."),
        "FR": ("📍 Suivi GPS refusé", "Le chauffeur n'a pas autorisé le partage de la position."),
        "PL": ("📍 Śledzenie GPS odrzucone", "Kierowca nie zezwolił na udostępnianie lokalizacji."),
        "LT": ("📍 GPS sekimas atmestas", "Vairuotojas neleido dalintis vieta."),
        "LV": ("📍 GPS izsekošana noraidīta", "Vadītājs neatļāva kopīgot atrašanās vietu."),
        "IT": ("📍 Localizzazione GPS rifiutata", "L'autista non ha autorizzato la condivisione della posizione."),
        "TR": ("📍 GPS takibi reddedildi", "Sürücü konum paylaşımına izin vermedi."),
        "BE": ("📍 GPS-адсочванне адхілена", "Кіроўца не дазволіў перадачу геапазіцыі."),
        "RO": ("📍 Urmărire GPS refuzată", "Șoferul nu a permis partajarea locației."),
    },
    "tracking_stopped": {
        "RU": ("📍 GPS-отслеживание отменено", "Водитель отменил передачу местоположения до забора груза."),
        "KK": ("📍 GPS-бақылау тоқтатылды", "Жүргізуші жүкті алғанға дейін орналасқан жерін беруден бас тартты."),
        "ZH": ("📍 GPS 追踪已停止", "司机在提货前取消了位置共享。"),
        "EN": ("📍 GPS tracking stopped", "The driver stopped sharing location before pickup."),
        "UZ": ("📍 GPS-kuzatuv bekor qilindi", "Haydovchi yukni olishdan oldin joylashuvni uzatishni to'xtatdi."),
        "KY": ("📍 GPS-байкоо токтотулду", "Айдоочу жүктү алганга чейин жайгашкан жерди берүүдөн баш тартты."),
        "TG": ("📍 Пайгирии GPS қатъ шуд", "Ронанда пеш аз гирифтани бор интиқоли ҷойгиршавиро қатъ кард."),
        "DE": ("📍 GPS-Ortung beendet", "Der Fahrer hat die Standortfreigabe vor der Abholung beendet."),
        "FR": ("📍 Suivi GPS arrêté", "Le chauffeur a arrêté le partage de position avant le chargement."),
        "PL": ("📍 Śledzenie GPS zatrzymane", "Kierowca zatrzymał udostępnianie lokalizacji przed załadunkiem."),
        "LT": ("📍 GPS sekimas sustabdytas", "Vairuotojas sustabdė vietos dalinimąsi prieš pakrovimą."),
        "LV": ("📍 GPS izsekošana apturēta", "Vadītājs pārtrauca atrašanās vietas kopīgošanu pirms iekraušanas."),
        "IT": ("📍 Localizzazione GPS interrotta", "L'autista ha interrotto la condivisione della posizione prima del carico."),
        "TR": ("📍 GPS takibi durduruldu", "Sürücü yük alımından önce konum paylaşımını durdurdu."),
        "BE": ("📍 GPS-адсочванне спынена", "Кіроўца спыніў перадачу месцазнаходжання да забору груза."),
        "RO": ("📍 Urmărire GPS oprită", "Șoferul a oprit partajarea locației înainte de încărcare."),
    },
    "gps_lost": {
        "RU": ("⚠️ Пропал сигнал GPS", "Машина не передаёт местоположение уже некоторое время. Проверьте связь с водителем."),
        "KK": ("⚠️ GPS сигналы жоғалды", "Көлік біраз уақыттан бері орналасқан жерін бермей тұр. Жүргізушімен байланысты тексеріңіз."),
        "ZH": ("⚠️ GPS 信号丢失", "车辆已有一段时间未更新位置。请与司机确认联系。"),
        "EN": ("⚠️ GPS signal lost", "The truck has not reported its location for a while. Check in with the driver."),
        "UZ": ("⚠️ GPS signali yo'qoldi", "Mashina biroz vaqtdan beri joylashuvini uzatmayapti. Haydovchi bilan bog'lanishni tekshiring."),
        "KY": ("⚠️ GPS сигналы жоголду", "Унаа бир аз убакыттан бери жайгашкан жерин бербей жатат. Айдоочу менен байланышты текшериңиз."),
        "TG": ("⚠️ Сигнали GPS гум шуд", "Мошин муддате ҷойгиршавии худро интиқол намедиҳад. Бо ронанда тамос гиред."),
        "DE": ("⚠️ GPS-Signal verloren", "Der LKW meldet seit einiger Zeit keinen Standort. Kontaktieren Sie den Fahrer."),
        "FR": ("⚠️ Signal GPS perdu", "Le camion ne signale plus sa position depuis un moment. Contactez le chauffeur."),
        "PL": ("⚠️ Utracono sygnał GPS", "Ciężarówka od jakiegoś czasu nie przesyła lokalizacji. Skontaktuj się z kierowcą."),
        "LT": ("⚠️ Prarastas GPS signalas", "Sunkvežimis kurį laiką nesiunčia vietos duomenų. Susisiekite su vairuotoju."),
        "LV": ("⚠️ Zaudēts GPS signāls", "Kravas auto jau kādu laiku nesūta atrašanās vietu. Sazinieties ar vadītāju."),
        "IT": ("⚠️ Segnale GPS perso", "Il camion non invia la posizione da un po'. Contatta l'autista."),
        "TR": ("⚠️ GPS sinyali kayboldu", "Kamyon bir süredir konum bildirmiyor. Sürücü ile iletişime geçin."),
        "BE": ("⚠️ Прапаў сігнал GPS", "Машына ўжо некаторы час не перадае месцазнаходжанне. Праверце сувязь з кіроўцам."),
        "RO": ("⚠️ Semnal GPS pierdut", "Camionul nu a raportat locația de ceva vreme. Contactați șoferul."),
    },
    "gps_restored": {
        "RU": ("✅ Сигнал GPS восстановлен", "Машина снова передаёт местоположение."),
        "KK": ("✅ GPS сигналы қалпына келді", "Көлік орналасқан жерін қайта беруде."),
        "ZH": ("✅ GPS 信号已恢复", "车辆已恢复位置更新。"),
        "EN": ("✅ GPS signal restored", "The truck is reporting its location again."),
        "UZ": ("✅ GPS signali tiklandi", "Mashina joylashuvini yana uzatmoqda."),
        "KY": ("✅ GPS сигналы калыбына келди", "Унаа кайра жайгашкан жерин берүүдө."),
        "TG": ("✅ Сигнали GPS барқарор шуд", "Мошин боз ҷойгиршавии худро интиқол медиҳад."),
        "DE": ("✅ GPS-Signal wiederhergestellt", "Der LKW meldet wieder seinen Standort."),
        "FR": ("✅ Signal GPS rétabli", "Le camion signale de nouveau sa position."),
        "PL": ("✅ Sygnał GPS przywrócony", "Ciężarówka ponownie przesyła lokalizację."),
        "LT": ("✅ GPS signalas atkurtas", "Sunkvežimis vėl siunčia savo vietą."),
        "LV": ("✅ GPS signāls atjaunots", "Kravas auto atkal sūta atrašanās vietu."),
        "IT": ("✅ Segnale GPS ripristinato", "Il camion sta di nuovo inviando la posizione."),
        "TR": ("✅ GPS sinyali geri geldi", "Kamyon tekrar konum bildiriyor."),
        "BE": ("✅ Сігнал GPS адноўлены", "Машына зноў перадае месцазнаходжанне."),
        "RO": ("✅ Semnal GPS restabilit", "Camionul raportează din nou locația."),
    },
    "cgr_called": {
        "RU": ("🚛 Ваша очередь подошла", "Бронь {booking}: вас вызвали на пункт пропуска."),
        "KK": ("🚛 Кезегіңіз келді", "Брондау {booking}: сізді өткізу пунктіне шақырды."),
        "ZH": ("🚛 轮到您了", "预约 {booking}：您已被叫号前往口岸。"),
        "EN": ("🚛 Your turn is up", "Booking {booking}: you have been called to the checkpoint."),
        "UZ": ("🚛 Navbatingiz keldi", "{booking} bron: sizni o'tkazish punktiga chaqirishdi."),
        "KY": ("🚛 Кезегиңиз келди", "{booking} брон: сизди өткөрүү пунктуна чакырышты."),
        "TG": ("🚛 Навбати шумо расид", "Брони {booking}: шуморо ба нуқтаи гузаргоҳ даъват карданд."),
        "DE": ("🚛 Sie sind an der Reihe", "Buchung {booking}: Sie wurden zum Kontrollpunkt gerufen."),
        "FR": ("🚛 C'est votre tour", "Réservation {booking} : vous êtes appelé au poste de contrôle."),
        "PL": ("🚛 Twoja kolej", "Rezerwacja {booking}: zostałeś wezwany do punktu kontrolnego."),
        "LT": ("🚛 Jūsų eilė", "Rezervacija {booking}: jūs pakviesti į kontrolės punktą."),
        "LV": ("🚛 Jūsu rinda", "Rezervācija {booking}: jūs esat izsaukts uz kontrolpunktu."),
        "IT": ("🚛 È il tuo turno", "Prenotazione {booking}: sei stato chiamato al posto di controllo."),
        "TR": ("🚛 Sıra sizde", "Rezervasyon {booking}: kontrol noktasına çağrıldınız."),
        "BE": ("🚛 Ваша чарга падышла", "Брон {booking}: вас выклікалі на пункт пропуску."),
        "RO": ("🚛 Este rândul dumneavoastră", "Rezervare {booking}: ați fost chemat la punctul de control."),
    },
    "cgr_crossed": {
        "RU": ("✅ Граница пройдена", "Бронь {booking}: пункт пропуска пройден."),
        "KK": ("✅ Шекара өтілді", "Брондау {booking}: өткізу пункті өтілді."),
        "ZH": ("✅ 已通过边境", "预约 {booking}：已通过口岸。"),
        "EN": ("✅ Border crossed", "Booking {booking}: checkpoint crossed."),
        "UZ": ("✅ Chegara o'tildi", "{booking} bron: o'tkazish punkti o'tildi."),
        "KY": ("✅ Чек ара өтүлдү", "{booking} брон: өткөрүү пунктусу өтүлдү."),
        "TG": ("✅ Марз убур шуд", "Брони {booking}: нуқтаи гузаргоҳ убур шуд."),
        "DE": ("✅ Grenze passiert", "Buchung {booking}: Kontrollpunkt passiert."),
        "FR": ("✅ Frontière franchie", "Réservation {booking} : poste de contrôle franchi."),
        "PL": ("✅ Granica przekroczona", "Rezerwacja {booking}: punkt kontrolny przekroczony."),
        "LT": ("✅ Siena kirsta", "Rezervacija {booking}: kontrolės punktas praeitas."),
        "LV": ("✅ Robeža šķērsota", "Rezervācija {booking}: kontrolpunkts šķērsots."),
        "IT": ("✅ Confine attraversato", "Prenotazione {booking}: posto di controllo superato."),
        "TR": ("✅ Sınır geçildi", "Rezervasyon {booking}: kontrol noktası geçildi."),
        "BE": ("✅ Мяжа пройдзена", "Брон {booking}: пункт пропуску пройдзены."),
        "RO": ("✅ Frontieră trecută", "Rezervare {booking}: punct de control trecut."),
    },
    "cgr_revoked": {
        "RU": ("⚠️ Бронь отозвана", "Бронь {booking}: проверьте статус в CarGoRuqsat."),
        "KK": ("⚠️ Брондау кері қайтарылды", "Брондау {booking}: CarGoRuqsat жүйесінен мәртебені тексеріңіз."),
        "ZH": ("⚠️ 预约已撤销", "预约 {booking}：请在 CarGoRuqsat 中查看状态。"),
        "EN": ("⚠️ Booking revoked", "Booking {booking}: check its status in CarGoRuqsat."),
        "UZ": ("⚠️ Bron bekor qilindi", "{booking} bron: CarGoRuqsat tizimida holatni tekshiring."),
        "KY": ("⚠️ Брон кайтарылды", "{booking} брон: CarGoRuqsat тутумунда абалды текшериңиз."),
        "TG": ("⚠️ Брон бекор шуд", "Брони {booking}: ҳолатро дар CarGoRuqsat санҷед."),
        "DE": ("⚠️ Buchung widerrufen", "Buchung {booking}: Status in CarGoRuqsat prüfen."),
        "FR": ("⚠️ Réservation révoquée", "Réservation {booking} : vérifiez le statut dans CarGoRuqsat."),
        "PL": ("⚠️ Rezerwacja cofnięta", "Rezerwacja {booking}: sprawdź status w CarGoRuqsat."),
        "LT": ("⚠️ Rezervacija atšaukta", "Rezervacija {booking}: patikrinkite būseną CarGoRuqsat sistemoje."),
        "LV": ("⚠️ Rezervācija atcelta", "Rezervācija {booking}: pārbaudiet statusu CarGoRuqsat."),
        "IT": ("⚠️ Prenotazione revocata", "Prenotazione {booking}: controlla lo stato in CarGoRuqsat."),
        "TR": ("⚠️ Rezervasyon iptal edildi", "Rezervasyon {booking}: CarGoRuqsat'ta durumu kontrol edin."),
        "BE": ("⚠️ Брон адклікана", "Брон {booking}: праверце статус у CarGoRuqsat."),
        "RO": ("⚠️ Rezervare revocată", "Rezervare {booking}: verificați starea în CarGoRuqsat."),
    },
}


def push_text(event: str, locale: Optional[str], **params) -> tuple[Optional[str], Optional[str]]:
    """Returns (title, body) localized for `locale`, or (None, None) if
    `event` is not a known system-push template — callers must fall back to
    their own text in that case (keeps this module additive/non-breaking for
    events not yet migrated here).
    """
    templates = TEMPLATES.get(event)
    if not templates:
        return None, None
    loc = normalize_locale(locale)
    title, body = templates.get(loc) or templates[DEFAULT_LOCALE]
    try:
        return title.format(**params), body.format(**params)
    except (KeyError, IndexError):
        # A caller passed the wrong/missing params — fail safe to the
        # unformatted template rather than raising out of a push send path.
        return title, body
