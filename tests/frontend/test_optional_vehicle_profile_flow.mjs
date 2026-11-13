import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./mocks/render-env-hooks.mjs', import.meta.url);
const { __setUseStateValue } = await import('./mocks/react-stub.mjs');
const { storage } = await import('../../src/utils/storage.js');
const { vehicleAPI } = await import('../../src/utils/vehicleAPI.js');
const { default: BackButton } = await import('../../src/components/ui/v1/BackButton.js');
const { default: VehicleChooserScreen } = await import('../../src/screens/vehicle/VehicleChooserScreen.js');
const { default: VehicleSetupCountryScreen } = await import('../../src/screens/vehicle/VehicleSetupCountryScreen.js');

function findByTestId(node, testID) {
  if (!node || typeof node !== 'object') return null;
  if (node.props?.testID === testID) return node;
  for (const child of (node.children || []).flat(Infinity)) {
    const found = findByTestId(child, testID);
    if (found) return found;
  }
  for (const value of Object.values(node.props || {})) {
    if (value && typeof value === 'object') {
      const found = findByTestId(value, testID);
      if (found) return found;
    }
  }
  return null;
}

function findByType(node, componentType) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === componentType) return node;
  for (const child of (node.children || []).flat(Infinity)) {
    const found = findByType(child, componentType);
    if (found) return found;
  }
  for (const value of Object.values(node.props || {})) {
    if (value && typeof value === 'object') {
      const found = findByType(value, componentType);
      if (found) return found;
    }
  }
  return null;
}

test('profile vehicle form can be opened, abandoned without saving, then opened again', async () => {
  const removedKeys = [];
  const navigationCalls = [];
  let saves = 0;
  const originalRemove = storage.remove;
  const originalSave = vehicleAPI.save;
  storage.remove = async (key) => removedKeys.push(key);
  vehicleAPI.save = async () => { saves += 1; return { ok: true }; };
  const navigation = {
    goBack: () => navigationCalls.push(['back']),
    navigate: (...args) => navigationCalls.push(['navigate', ...args]),
    replace: (...args) => navigationCalls.push(['replace', ...args]),
  };

  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      __setUseStateValue([]);
      const chooser = VehicleChooserScreen({ navigation, route: { params: { origin: 'Profile' } } });
      const add = findByTestId(chooser, 'vehicle-chooser-add');
      assert.ok(add, 'the profile vehicle list exposes a voluntary Add vehicle action');
      await add.props.onPress();
      assert.deepEqual(navigationCalls.at(-1), ['navigate', 'VehicleSetupCountry', { role: 'driver', origin: 'Profile' }]);

      __setUseStateValue(false);
      const setup = VehicleSetupCountryScreen({ navigation, route: { params: { role: 'driver', origin: 'Profile' } } });
      const back = findByType(setup, BackButton);
      assert.ok(back, 'the unsaved vehicle form has a back action');
      back.props.onPress();
      assert.deepEqual(navigationCalls.at(-1), ['back']);
      assert.equal(saves, 0, 'leaving without saving makes no vehicle API write');
    }
    assert.equal(removedKeys.length, 2, 'each fresh optional add starts with a clean local draft');
    assert.equal(saves, 0);
  } finally {
    storage.remove = originalRemove;
    vehicleAPI.save = originalSave;
    __setUseStateValue(false);
  }
});
