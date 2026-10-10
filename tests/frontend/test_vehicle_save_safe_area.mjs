import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./mocks/render-env-hooks.mjs', import.meta.url);
const { __setSafeAreaInsets } = await import('./mocks/safe-area-stub.mjs');
const { default: VehicleSetupCountryScreen } = await import('../../src/screens/vehicle/VehicleSetupCountryScreen.js');
function findParent(node, id) {
  if (!node || typeof node !== 'object') return null;
  const children = (node.children || []).flat(Infinity);
  if (children.some(child => child?.props?.testID === id)) return node;
  for (const child of children) { const parent = findParent(child, id); if (parent) return parent; }
  return null;
}
for (const [device, bottom] of [['Huawei three-button navigation', 48], ['Android gesture navigation', 24], ['iPhone home indicator', 34], ['web without system inset', 0]]) {
  test(`vehicle save control stays above ${device}`, () => {
    __setSafeAreaInsets({ top: 24, bottom, left: 0, right: 0 });
    try {
      const tree = VehicleSetupCountryScreen({ navigation: { goBack() {}, navigate() {}, replace() {} }, route: { params: {} } });
      const footer = findParent(tree, 'vehicle-save');
      assert.ok(footer, 'save control is rendered in the form');
      const style = Object.assign({}, ...[footer.props.style].flat(Infinity));
      const viewportBottom = 844;
      const footerBottom = viewportBottom - (style.bottom || 0);
      assert.ok(footerBottom <= viewportBottom - bottom, 'footer must not overlap the system navigation area');
      assert.equal(style.bottom || 0, bottom, 'reserve the system inset exactly once');
    } finally { __setSafeAreaInsets({ top: 0, bottom: 0, left: 0, right: 0 }); }
  });
}
