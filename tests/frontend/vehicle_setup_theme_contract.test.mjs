import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const ui = read('src/components/vehicle/VehicleSetupUI.js');
const screens = [
  'src/screens/vehicle/VehicleSetupCountryScreen.js',
  'src/screens/vehicle/VehicleSetupMachineScreen.js',
  'src/screens/vehicle/VehicleSetupReviewScreen.js',
  'src/screens/vehicle/VehicleSetupSuccessScreen.js',
  'src/screens/vehicle/VehicleChooserScreen.js',
].map(read);

test('vehicle setup styles are resolved from the active driver theme', () => {
  assert.match(ui, /import \{ useDriverCeramicColors \} from '..\/..\/theme\/designV1'/);
  assert.match(ui, /export const useVehicleSetupStyles = \(\) => \{/);
  assert.match(ui, /StyleSheet\.create\(createStyles\(vehicleBrand\(colors\)\)\)/);
  assert.match(ui, /empty: \{ color: brand\.textTertiary \}/);
  assert.doesNotMatch(ui, /import \{ DRIVER_CERAMIC \} from/);
  assert.doesNotMatch(ui, /backgroundColor: '#E3EAF0'|backgroundColor: '#D8DEE5'|backgroundColor: '#FCEBEC'/);
  assert.doesNotMatch(ui, /empty: \{ color: 'transparent' \}/);
});

test('every live vehicle surface obtains dynamic styles instead of the light-only export', () => {
  for (const screen of screens) {
    assert.match(screen, /useVehicleSetupStyles\(\)/);
    assert.doesNotMatch(screen, /import \{ DRIVER_CERAMIC \} from/);
  }
});

test('vehicle fields use the active theme for placeholder and loading contrast', () => {
  const country = screens[0];
  const machine = screens[1];
  assert.match(country, /placeholderTextColor=\{ceramic\.textDim\}/);
  assert.match(country, /ActivityIndicator color=\{ceramic\.activeText\}/);
  assert.match(machine, /placeholderTextColor: ceramic\.textDim/);
  assert.doesNotMatch(country, /placeholderTextColor="#728096"/);
  assert.doesNotMatch(machine, /placeholderTextColor: '#6B7A71'/);
});

test('review preserves a manually entered Other model instead of rendering the technical selector value', () => {
  const review = screens[2];
  assert.match(review, /d\.model === 'Other' \? \(d\.model_custom \|\| c\.model\)/);
  assert.doesNotMatch(review, /d\.model === 'Other' \? \(d\.model \|\| c\.model\)/);
});
