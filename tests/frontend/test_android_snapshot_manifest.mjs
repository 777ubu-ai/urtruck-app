import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('prebuild удаляет службу location, сохраняя остальные службы, и допускает повтор', () => {
  const module = { exports: null };
  vm.runInNewContext(readFileSync('plugins/withAndroidSnapshotLocation.js', 'utf8'), {
    module, require: () => ({ withAndroidManifest: (config, callback) => callback(config) }),
  });
  const unrelated = { $: { 'android:name': '.UrTruckFirebaseMessagingService', 'android:exported': 'false' } };
  const config = { modResults: { manifest: { application: [{ service: [unrelated, {
    $: { 'android:name': 'expo.modules.location.services.LocationTaskService', 'android:foregroundServiceType': 'location' },
    'intent-filter': [{}],
  }] }] } } };
  module.exports(config);
  module.exports(config);
  const services = config.modResults.manifest.application[0].service;
  assert.equal(services.length, 2);
  assert.equal(services[0], unrelated);
  assert.deepEqual(JSON.parse(JSON.stringify(services[1])), {
    $: { 'android:name': 'expo.modules.location.services.LocationTaskService', 'tools:node': 'remove' },
  });
  const source = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
  assert.match(source, /android:name="expo\.modules\.location\.services\.LocationTaskService" tools:node="remove"/);
  assert.match(readFileSync('app.config.js', 'utf8'), /plugins\/withAndroidSnapshotLocation/);
});
