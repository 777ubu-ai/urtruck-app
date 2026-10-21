const { withAndroidManifest } = require('@expo/config-plugins');

// expo-location объявляет службу из library manifest даже без background permissions.
module.exports = function withAndroidSnapshotLocation(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest.$ = manifest.$ || {};
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const application = manifest.application?.[0];
    if (!application) throw new Error('Android application manifest is missing');
    const name = 'expo.modules.location.services.LocationTaskService';
    application.service = (application.service || []).filter((service) => service.$?.['android:name'] !== name);
    application.service.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    return mod;
  });
};
