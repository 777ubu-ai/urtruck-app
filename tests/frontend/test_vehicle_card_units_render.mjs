import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./mocks/render-env-hooks.mjs', import.meta.url);
const { __setUseStateValue } = await import('./mocks/react-stub.mjs');
const { default: VehicleChooserScreen } = await import('../../src/screens/vehicle/VehicleChooserScreen.js');
function findList(node) {
  if (!node || typeof node !== 'object') return null;
  if (typeof node.props?.renderItem === 'function') return node;
  for (const child of (node.children || []).flat(Infinity)) { const found = findList(child); if (found) return found; }
  return null;
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  return (node.children || []).flat(Infinity).map(text).join('');
}
for (const [lang, expected] of [['ZH', '篷布车 · 30 吨 · 150 立方米'], ['EN', 'Curtain sider · 30 t · 150 m³'], ['RU', 'Тент · 30 т · 150 м³'], ['KK', 'Тент · 30 т · 150 м³']]) {
  test(`vehicle card uses readable ${lang} units`, () => {
    __setUseStateValue(lang);
    try {
      const tree = VehicleChooserScreen({ navigation: { goBack() {}, navigate() {}, replace() {} }, route: { params: { origin: 'Profile' } } });
      const list = findList(tree); assert.ok(list, 'vehicle list renders');
      const card = list.props.renderItem({ item: { id: 'qa', make: 'Volvo', model: 'FH', body_type: 'curtain_sider', payload_tons: 30, cargo_volume_m3: 150, license_plate: 'QA' } });
      assert.ok(text(card).includes(expected), `expected localized dimensions: ${expected}; got ${text(card)}`);
    } finally { __setUseStateValue(false); }
  });
}
