from pathlib import Path

path = Path('src/screens/TripDetail.js')
text = path.read_text(encoding='utf-8')

old_import = "import { removeTrip, advanceTripState, TRIP_STATES, TRIP_STATE_INFO } from '../utils/store';"
new_import = "import { TRIP_STATES, TRIP_STATE_INFO } from '../utils/store';"
if old_import not in text:
    raise SystemExit('expected legacy trip-state import not found')
text = text.replace(old_import, new_import, 1)

old_button = """                {isOwner && !passed && i === currentIdx + 1 && (\n                  <TouchableOpacity\n                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: info.color }}\n                    onPress={() => advanceTripState(trip.id, st)}\n                  >\n                    <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>{t('trip_mark')}</Text>\n                  </TouchableOpacity>\n                )}\n"""
if old_button not in text:
    raise SystemExit('expected trip_mark button block not found')
text = text.replace(old_button, '', 1)

old_padding = "paddingBottom: 60 + insets.bottom"
new_padding = "paddingBottom: 96 + insets.bottom"
if old_padding not in text:
    raise SystemExit('expected TripDetail safe-area padding not found')
text = text.replace(old_padding, new_padding, 1)

path.write_text(text, encoding='utf-8')
print('TripDetail cleaned: removed legacy mark action and increased bottom safe-area padding')
