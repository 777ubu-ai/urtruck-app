#!/usr/bin/env python3
from pathlib import Path


def replace_exact(path: str, old: str, new: str, expected: int = 1) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{path}: expected {expected}, got {count}: {old[:100]}')
    p.write_text(text.replace(old, new), encoding='utf-8')


# Seven logistics points found by the strict 113-point geography audit.
marker = "  'Малашевичи':        { zh: '马拉舍维奇', en: 'Malaszewicze' },"
addition = """  'Малашевичи':        { zh: '马拉舍维奇', en: 'Malaszewicze' },
  'Малашевичи (терминал)': { zh: '马拉舍维奇（终端）', en: 'Malaszewicze terminal' },
  'Хелм (Chelm)':       { zh: '海乌姆（Chelm）', en: 'Chelm' },
  'Каунасский ТКЛ':     { zh: '考纳斯运输物流中心', en: 'Kaunas transport logistics centre' },
  'СЭЗ Хоргос-Восточные ворота': { zh: '霍尔果斯-东方大门经济特区', en: 'Khorgos - Eastern Gate SEZ' },
  'Сухой порт Урумчи':  { zh: '乌鲁木齐陆港', en: 'Urumqi dry port' },
  'Порт Поти':          { zh: '波季港', en: 'Port of Poti' },
  'Порт Мерсин':        { zh: '梅尔辛港', en: 'Port of Mersin' },"""
replace_exact('src/utils/places.js', marker, addition)

# Remove the last observed Russian fallback in the trip bid card.
replace_exact('src/screens/TripDetail.js', "{t('my_bid_label') || 'Моя ставка'}", "{t('my_bid_label')}")

# Behavior fixtures already prove ZH works. This source substring assertion
# falsely matched the correct `l !== 'zh' && l !== 'en'` condition.
replace_exact(
    'qa/utils/zhLocalizationSmoke.js',
    "  assert(!places.localizePlace.toString().includes(\"l !== 'en'\"), 'localizePlace still blocks ZH localization');\n",
    '',
)
