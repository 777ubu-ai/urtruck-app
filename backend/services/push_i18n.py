"""System-generated push notification text, localized by recipient device
locale (push-recovery closure track, 2026-09-09).

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
"""
from typing import Optional

SUPPORTED_LOCALES = ("RU", "KK", "ZH", "EN")
DEFAULT_LOCALE = "RU"


def normalize_locale(raw: Optional[str]) -> str:
    """Accepts app-native codes ('RU'/'KK'/'ZH'/'EN') or BCP-47-ish values a
    client might report (Localization.getLocales(), e.g. 'ru-RU', 'zh-Hans-CN',
    'kk', 'en-US') and maps them onto the 4 codes the app actually supports.
    Unknown/missing -> DEFAULT_LOCALE (RU), matching src/utils/i18n.js's own
    fallback for anything outside its 4 supported languages.
    """
    if not raw:
        return DEFAULT_LOCALE
    code = str(raw).strip().upper()
    if code.startswith("RU"):
        return "RU"
    if code.startswith("KK") or code.startswith("KZ"):
        return "KK"
    if code.startswith("ZH") or code.startswith("CN"):
        return "ZH"
    if code.startswith("EN"):
        return "EN"
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
    },
    "bid_accepted": {
        "RU": ("✅ Ставка принята!", "Ваше предложение {amount} принято! Сделка создана."),
        "KK": ("✅ Баға қабылданды!", "Сіздің {amount} ұсынысыңыз қабылданды! Мәміле жасалды."),
        "ZH": ("✅ 报价已接受！", "您的 {amount} 报价已被接受！交易已创建。"),
        "EN": ("✅ Bid accepted!", "Your offer of {amount} was accepted! Deal created."),
    },
    "bid_rejected": {
        "RU": ("❌ Ставка отклонена", "Ваше предложение {amount} отклонено владельцем."),
        "KK": ("❌ Баға қабылданбады", "Сіздің {amount} ұсынысыңызды иесі қабылдамады."),
        "ZH": ("❌ 报价被拒绝", "您的 {amount} 报价已被货主拒绝。"),
        "EN": ("❌ Bid rejected", "Your offer of {amount} was rejected by the owner."),
    },
    "bid_countered": {
        "RU": ("🔁 Встречная цена", "Новая встречная цена: {amount}."),
        "KK": ("🔁 Қарсы баға", "Жаңа қарсы баға: {amount}."),
        "ZH": ("🔁 还价", "新的还价：{amount}。"),
        "EN": ("🔁 Counter-offer", "New counter-offer: {amount}."),
    },
    "bid_counter_cancelled": {
        "RU": ("↩️ Встречная цена отменена", "Исходная ставка {amount} снова активна."),
        "KK": ("↩️ Қарсы баға болдырылмады", "Бастапқы баға {amount} қайта белсенді."),
        "ZH": ("↩️ 还价已取消", "原报价 {amount} 已重新生效。"),
        "EN": ("↩️ Counter-offer cancelled", "Your original bid {amount} is active again."),
    },
    "deal_status_in_progress": {
        "RU": ("🚛 Рейс начался", "{route}"),
        "KK": ("🚛 Рейс басталды", "{route}"),
        "ZH": ("🚛 运输开始", "{route}"),
        "EN": ("🚛 Shipment started", "{route}"),
    },
    "deal_status_at_border": {
        "RU": ("🛂 Груз на границе", "{route}"),
        "KK": ("🛂 Жүк шекарада", "{route}"),
        "ZH": ("🛂 货物在边境", "{route}"),
        "EN": ("🛂 Cargo at border", "{route}"),
    },
    "deal_status_delivered": {
        "RU": ("✅ Груз доставлен", "{route}"),
        "KK": ("✅ Жүк жеткізілді", "{route}"),
        "ZH": ("✅ 货物已送达", "{route}"),
        "EN": ("✅ Cargo delivered", "{route}"),
    },
    "deal_status_received": {
        "RU": ("✅ Получение подтверждено", "{route}"),
        "KK": ("✅ Жүк қабылданды", "{route}"),
        "ZH": ("✅ 已确认收货", "{route}"),
        "EN": ("✅ Receipt confirmed", "{route}"),
    },
    "deal_status_completed": {
        "RU": ("🤝 Сделка завершена", "{route}"),
        "KK": ("🤝 Мәміле аяқталды", "{route}"),
        "ZH": ("🤝 交易已完成", "{route}"),
        "EN": ("🤝 Deal completed", "{route}"),
    },
    "deal_status_cancelled": {
        "RU": ("❌ Сделка отменена", "{route}"),
        "KK": ("❌ Мәміле бас тартылды", "{route}"),
        "ZH": ("❌ 交易已取消", "{route}"),
        "EN": ("❌ Deal cancelled", "{route}"),
    },
    "tracking_request": {
        "RU": ("📍 Запрос GPS-отслеживания", "Грузоотправитель просит показать местоположение машины по сделке."),
        "KK": ("📍 GPS-бақылау сұрауы", "Жүк жөнелтуші мәміле бойынша көліктің орналасқан жерін көрсетуді сұрайды."),
        "ZH": ("📍 GPS 追踪请求", "货主请求查看本次交易的车辆位置。"),
        "EN": ("📍 GPS tracking request", "The shipper is asking to see the truck's location for this deal."),
    },
    "tracking_approved": {
        "RU": ("📍 GPS-отслеживание включено", "Водитель разрешил показывать местоположение машины."),
        "KK": ("📍 GPS-бақылау қосылды", "Жүргізуші көліктің орналасқан жерін көрсетуге рұқсат берді."),
        "ZH": ("📍 GPS 追踪已开启", "司机已允许显示车辆位置。"),
        "EN": ("📍 GPS tracking enabled", "The driver allowed sharing the truck's location."),
    },
    "tracking_declined": {
        "RU": ("📍 GPS-отслеживание отклонено", "Водитель не разрешил передачу геопозиции."),
        "KK": ("📍 GPS-бақылау қабылданбады", "Жүргізуші геолокацияны беруге рұқсат бермеді."),
        "ZH": ("📍 GPS 追踪被拒绝", "司机未同意共享位置信息。"),
        "EN": ("📍 GPS tracking declined", "The driver did not allow sharing location."),
    },
    "tracking_stopped": {
        "RU": ("📍 GPS-отслеживание отменено", "Водитель отменил передачу местоположения до забора груза."),
        "KK": ("📍 GPS-бақылау тоқтатылды", "Жүргізуші жүкті алғанға дейін орналасқан жерін беруден бас тартты."),
        "ZH": ("📍 GPS 追踪已停止", "司机在提货前取消了位置共享。"),
        "EN": ("📍 GPS tracking stopped", "The driver stopped sharing location before pickup."),
    },
    "gps_lost": {
        "RU": ("⚠️ Пропал сигнал GPS", "Машина не передаёт местоположение уже некоторое время. Проверьте связь с водителем."),
        "KK": ("⚠️ GPS сигналы жоғалды", "Көлік біраз уақыттан бері орналасқан жерін бермей тұр. Жүргізушімен байланысты тексеріңіз."),
        "ZH": ("⚠️ GPS 信号丢失", "车辆已有一段时间未更新位置。请与司机确认联系。"),
        "EN": ("⚠️ GPS signal lost", "The truck has not reported its location for a while. Check in with the driver."),
    },
    "gps_restored": {
        "RU": ("✅ Сигнал GPS восстановлен", "Машина снова передаёт местоположение."),
        "KK": ("✅ GPS сигналы қалпына келді", "Көлік орналасқан жерін қайта беруде."),
        "ZH": ("✅ GPS 信号已恢复", "车辆已恢复位置更新。"),
        "EN": ("✅ GPS signal restored", "The truck is reporting its location again."),
    },
    "cgr_called": {
        "RU": ("🚛 Ваша очередь подошла", "Бронь {booking}: вас вызвали на пункт пропуска."),
        "KK": ("🚛 Кезегіңіз келді", "Брондау {booking}: сізді өткізу пунктіне шақырды."),
        "ZH": ("🚛 轮到您了", "预约 {booking}：您已被叫号前往口岸。"),
        "EN": ("🚛 Your turn is up", "Booking {booking}: you have been called to the checkpoint."),
    },
    "cgr_crossed": {
        "RU": ("✅ Граница пройдена", "Бронь {booking}: пункт пропуска пройден."),
        "KK": ("✅ Шекара өтілді", "Брондау {booking}: өткізу пункті өтілді."),
        "ZH": ("✅ 已通过边境", "预约 {booking}：已通过口岸。"),
        "EN": ("✅ Border crossed", "Booking {booking}: checkpoint crossed."),
    },
    "cgr_revoked": {
        "RU": ("⚠️ Бронь отозвана", "Бронь {booking}: проверьте статус в CarGoRuqsat."),
        "KK": ("⚠️ Брондау кері қайтарылды", "Брондау {booking}: CarGoRuqsat жүйесінен мәртебені тексеріңіз."),
        "ZH": ("⚠️ 预约已撤销", "预约 {booking}：请在 CarGoRuqsat 中查看状态。"),
        "EN": ("⚠️ Booking revoked", "Booking {booking}: check its status in CarGoRuqsat."),
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
