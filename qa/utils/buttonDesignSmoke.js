const fs = require('fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function expect(source, needle, message) {
  if (!source.includes(needle)) throw new Error(message);
}

const primary = read('src/components/ui/actions/PrimaryCTA.js');
const secondary = read('src/components/ui/actions/SecondaryButton.js');
const destructive = read('src/components/ui/actions/DestructiveButton.js');
const sticky = read('src/components/ui/v1/StickyCTABar.js');
const cargo = read('src/screens/CargoDetail.js');
const trip = read('src/screens/TripDetail.js');

expect(primary, "maxWidth: 520", 'PrimaryCTA must stay readable on wide screens');
expect(primary, "minHeight: 48", 'PrimaryCTA tap target must be at least 48px');
expect(primary, "fullWidth = false", 'PrimaryCTA must explicitly opt into unlimited width');
expect(primary, "alignSelf: 'center'", 'PrimaryCTA must be centered on wide screens');
expect(secondary, "maxWidth: 420", 'SecondaryButton must stay compact on wide screens');
expect(secondary, "minHeight: 48", 'SecondaryButton tap target must be at least 48px');
expect(secondary, "fullWidth = false", 'SecondaryButton must explicitly opt into full width');
expect(destructive, "maxWidth: 420", 'DestructiveButton must stay compact on wide screens');
expect(destructive, "minHeight: 44", 'DestructiveButton tap target must be at least 44px');
expect(primary, 'accessibilityRole="button"', 'PrimaryCTA must expose the button role');
expect(primary, 'accessibilityState={{ disabled: isDisabled, busy: loading }}', 'PrimaryCTA must expose disabled and busy states');
expect(secondary, 'accessibilityLabel={label}', 'SecondaryButton must expose its visible label');
expect(destructive, 'accessibilityState={{ disabled: isDisabled, busy: loading }}', 'DestructiveButton must expose disabled and busy states');
expect(sticky, 'const MAX_CONTENT_WIDTH = 720', 'Sticky CTA content width must be capped on desktop');
expect(sticky, 'useSafeAreaInsets', 'Sticky CTA must account for device safe area');
expect(sticky, "minHeight: 48", 'Sticky CTA buttons need at least a 48px tap target');
expect(sticky, 'numberOfLines={2}', 'Sticky CTA must support long translated labels');
expect(cargo, 'testID="cargo-my-bid-cancel"', 'Cargo bid withdraw action is missing');
expect(trip, 'testID="trip-my-bid-cancel"', 'Trip bid withdraw action is missing');
expect(cargo, "hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}", 'Cargo withdraw link needs safe hitSlop');
expect(trip, "hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}", 'Trip withdraw link needs safe hitSlop');

console.log('Button design smoke: OK');
