const fs = require('fs');

const path = 'src/screens/TripDetail.js';
let text = fs.readFileSync(path, 'utf8');

const oldImport = "import { removeTrip, advanceTripState, TRIP_STATES, TRIP_STATE_INFO } from '../utils/store';";
const newImport = "import { TRIP_STATES, TRIP_STATE_INFO } from '../utils/store';";
if (text.includes(oldImport)) text = text.replace(oldImport, newImport);

const oldButton = `                {isOwner && !passed && i === currentIdx + 1 && (\n                  <TouchableOpacity\n                    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: info.color }}\n                    onPress={() => advanceTripState(trip.id, st)}\n                  >\n                    <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>{t('trip_mark')}</Text>\n                  </TouchableOpacity>\n                )}\n`;
if (text.includes(oldButton)) text = text.replace(oldButton, '');

text = text.replace('paddingBottom: 60 + insets.bottom', 'paddingBottom: 96 + insets.bottom');

if (text.includes("t('trip_mark')") || text.includes('advanceTripState')) {
  throw new Error('TripDetail still contains the legacy trip mark action');
}
if (!text.includes('paddingBottom: 96 + insets.bottom')) {
  throw new Error('TripDetail iPhone bottom safe-area patch was not applied');
}

fs.writeFileSync(path, text, 'utf8');
console.log('TripDetail build patch applied');
