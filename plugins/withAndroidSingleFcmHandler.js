const { withAndroidManifest, withMainApplication, withAppBuildGradle } = require('@expo/config-plugins');

const FIREBASE_BASE_SERVICE = 'com.google.firebase.messaging.FirebaseMessagingService';
const EXPO_SERVICE = 'expo.modules.notifications.service.ExpoFirebaseMessagingService';
const URTRUCK_SERVICE = 'com.urtruck.app.UrTruckFirebaseMessagingService';

// One handler, inheriting Expo's token/render/deeplink delegate. The wrapper
// updates the native unread badge even when FCM renders notification+data in
// background without calling onMessageReceived.
module.exports = function withAndroidSingleFcmHandler(config) {
  const withFcmManifest = withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest.$ = manifest.$ || {};
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';
    const application = manifest.application?.[0];
    if (!application) return mod;
    application['meta-data'] = application['meta-data'] || [];
    application['meta-data'] = application['meta-data'].filter(
      (m) => m.$?.['android:name'] !== 'firebase_messaging_notification_delegation_enabled',
    );
    application['meta-data'].push({ $: {
      'android:name': 'firebase_messaging_notification_delegation_enabled',
      'android:value': 'false', 'tools:replace': 'android:value',
    } });
    application.service = application.service || [];
    for (const name of [FIREBASE_BASE_SERVICE, EXPO_SERVICE]) {
      const existing = application.service.find((s) => s.$?.['android:name'] === name);
      const attributes = { 'android:name': name, 'tools:node': 'remove' };
      if (existing) existing.$ = { ...(existing.$ || {}), ...attributes };
      else application.service.push({ $: attributes });
    }
    application.service = application.service.filter(
      (s) => !['.UrTruckFirebaseMessagingService', URTRUCK_SERVICE].includes(s.$?.['android:name']),
    );
    application.service.push({
      $: { 'android:name': URTRUCK_SERVICE, 'android:exported': 'false' },
      'intent-filter': [{
        $: { 'android:priority': '-1' },
        action: [{ $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } }],
      }],
    });
    return mod;
  });

  // Expo prebuild regenerates MainApplication.kt. Keep the app-owned native
  // modules registered in both production and suffixed QA application IDs.
  const withNativePackages = withMainApplication(withFcmManifest, (mod) => {
    const main = mod.modResults;
    if (main.language !== 'kt') throw new Error('UrTruck Android native packages require a Kotlin MainApplication');
    const importLines = [
      'import android.os.Build',
      'import android.util.Log',
      'import com.google.firebase.messaging.FirebaseMessaging',
      'import com.urtruck.app.UrTruckNotificationBadgePackage',
      'import com.urtruck.app.UrTruckSystemBarsPackage',
    ];
    let contents = main.contents;
    const packageLine = /^(package [^\n]+\n)/m;
    if (!packageLine.test(contents)) throw new Error('Generated MainApplication.kt package declaration missing');
    contents = contents.replace(packageLine, (match) => (
      match + importLines.filter((line) => !contents.includes(line)).join('\n') + '\n'
    ));

    const packageList = 'PackageList(this).packages.apply {';
    if (!contents.includes(packageList)) throw new Error('Generated MainApplication.kt PackageList anchor missing');
    const registrations = [
      'add(UrTruckNotificationBadgePackage())',
      'add(UrTruckSystemBarsPackage())',
    ];
    const missing = registrations.filter((line) => !contents.includes(line));
    if (missing.length) {
      contents = contents.replace(packageList, `${packageList}\n          ${missing.join('\n          ')}`);
    }
    const delegationCall = 'FirebaseMessaging.getInstance().setNotificationDelegationEnabled(false)';
    if (!contents.includes(delegationCall)) {
      const onCreateSuper = '    super.onCreate()';
      if (!contents.includes(onCreateSuper)) throw new Error('Generated MainApplication.kt onCreate anchor missing');
      const delegationSetup = `
    // Keep FCM in UrTruck's single Expo-derived handler on existing installs.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      try {
        ${delegationCall}
          .addOnFailureListener { Log.d("UrTruckBadge", "FCM delegation update failed") }
      } catch (_: Exception) { Log.d("UrTruckBadge", "FCM delegation update unavailable") }
    }`;
      contents = contents.replace(onCreateSuper, `${onCreateSuper}${delegationSetup}`);
    }
    main.contents = contents;
    return mod;
  });

  // The checked-in Android tree has these explicit dependencies, but Expo
  // prebuild regenerates app/build.gradle and drops them. Native Kotlin
  // sources restored by the QA workflows must compile against the same pins.
  return withAppBuildGradle(withNativePackages, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('UrTruck Android native dependencies require Groovy app/build.gradle');
    }
    let contents = mod.modResults.contents;
    const required = [
      'implementation("com.google.firebase:firebase-messaging:25.0.1")',
      'implementation("me.leolin:ShortcutBadger:1.1.22@aar")',
    ];
    const coordinates = [
      ['com.google.firebase:firebase-messaging', required[0]],
      ['me.leolin:ShortcutBadger', required[1]],
    ];
    const missing = [];
    for (const [coordinate, declaration] of coordinates) {
      const escapedCoordinate = coordinate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const current = contents.match(new RegExp(`implementation\\s*\\(?["']${escapedCoordinate}:([^"']+)["']\\)?`));
      const expectedVersion = declaration.match(/:([^:"']+)["']/)[1];
      if (current && current[1] !== expectedVersion) {
        throw new Error(`Unexpected UrTruck Android dependency pin for ${coordinate}`);
      }
      if (!current) missing.push(declaration);
    }
    if (missing.length) {
      const dependencyBlock = /(^|\n)(dependencies\s*\{)/m;
      if (!dependencyBlock.test(contents)) throw new Error('Generated app/build.gradle dependencies block missing');
      contents = contents.replace(dependencyBlock, (match, prefix, block) => (
        `${prefix}${block}\n    ${missing.join('\n    ')}`
      ));
    }
    mod.modResults.contents = contents;
    return mod;
  });
};
