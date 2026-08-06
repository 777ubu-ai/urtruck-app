const fs = require('fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function expect(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

const secondary = read('src/components/ui/actions/SecondaryButton.js');
const destructive = read('src/components/ui/actions/DestructiveButton.js');
const cargo = read('src/screens/CargoDetail.js');
const trip = read('src/screens/TripDetail.js');

expect(secondary, "maxWidth: 420", 'SecondaryButton must stay compact on wide screens');
expect(secondary, "minHeight: 48", 'SecondaryButton tap target must be at least 48px');
expect(secondary, "fullWidth = false", 'SecondaryButton must explicitly opt into full width');
expect(destructive, "maxWidth: 420", 'DestructiveButton must stay compact on wide screens');
expect(destructive, "minHeight: 44", 'DestructiveButton tap target must be at least 44px');
expect(cargo, 'testID="cargo-my-bid-cancel"', 'Cargo bid withdraw action is missing');
expect(trip, 'testID="trip-my-bid-cancel"', 'Trip bid withdraw action is missing');
expect(cargo, "hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}", 'Cargo withdraw link needs safe hitSlop');
expect(trip, "hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}", 'Trip withdraw link needs safe hitSlop');

console.log('Button design smoke: OK');
