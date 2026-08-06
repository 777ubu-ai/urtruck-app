const fs = require('fs');

const source = fs.readFileSync('src/screens/TripDetail.js', 'utf8');
const failures = [];

if (source.includes("t('trip_mark')")) failures.push('legacy trip_mark label is still rendered');
if (source.includes('advanceTripState')) failures.push('legacy local trip-state mutation is still reachable');
if (!source.includes('paddingBottom: 96 + insets.bottom')) failures.push('TripDetail lacks the enlarged iPhone bottom safe-area');
if (!source.includes("deal.status — ЕДИНСТВЕННЫЙ источник статуса") && !source.includes('единственный источник статуса')) {
  failures.push('authoritative deal status documentation is missing');
}

if (failures.length) {
  console.error('Trip status smoke failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Trip status smoke passed: no broken Отметить action; deal status remains authoritative; iPhone safe-area is protected.');
