#!/usr/bin/env python3
"""Restore tracked UrTruck bridges after Expo resets the isolated QA2 tree."""
import argparse
import os
from pathlib import Path
import re
import subprocess

BASE = 'android/app/src/main/java/com/urtruck/app'
NAMES = ('UrTruckSystemBarsModule.kt', 'UrTruckSystemBarsPackage.kt',
         'UrTruckNotificationBadgeModule.kt', 'UrTruckNotificationBadgePackage.kt',
         'UrTruckNotificationBadgeStore.kt', 'UrTruckFirebaseMessagingService.kt',
         'UrTruckBadgePolicy.kt')
PACKAGES = ('UrTruckSystemBarsPackage', 'UrTruckNotificationBadgePackage')
MARKER = '// UrTruck QA2 canonical FCM delegation policy'
POLICY = '''    // UrTruck QA2 canonical FCM delegation policy
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
      try {
        com.google.firebase.messaging.FirebaseMessaging.getInstance()
          .setNotificationDelegationEnabled(false)
          .addOnFailureListener { android.util.Log.d("UrTruckBadge", "FCM delegation update failed") }
      } catch (_: Exception) { android.util.Log.d("UrTruckBadge", "FCM delegation update unavailable") }
    }
'''

def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], text=True).strip()

def plan(repo, root, sha, env):
    if env.get('URTRUCK_BUILD_FLAVOR') != 'qa2' or env.get('EXPO_PUBLIC_API_URL') != 'https://qa2.urtruck.kz':
        raise ValueError('Only isolated QA2 host/flavor is allowed')
    if not re.fullmatch(r'[0-9a-f]{40}', sha) or git(repo, 'rev-parse', 'HEAD') != sha:
        raise ValueError('Source must be the exact checked-out SHA')
    gradle = (root / 'android/app/build.gradle').read_text()
    for field, value in (('namespace', 'com.urtruck.app.qa2'), ('applicationId', 'com.urtruck.app.qa2'), ('versionName', '1.0.9-qa2')):
        if len(re.findall(r'\b' + field + r'\s+["\']' + re.escape(value) + r'["\']', gradle)) != 1:
            raise ValueError('Unexpected generated ' + field)
    if re.search(r'\b(?:applicationIdSuffix|versionNameSuffix)\b', gradle):
        raise ValueError('Unexpected generated suffix')
    manifest = (root / 'android/app/src/main/AndroidManifest.xml').read_text()
    if manifest.count('android:name="com.urtruck.app.UrTruckFirebaseMessagingService"') != 1:
        raise ValueError('Missing single canonical FCM manifest service')
    canonical = git(repo, 'show', sha + ':' + BASE + '/MainApplication.kt')
    for name in PACKAGES:
        if 'add(' + name + '())' not in canonical:
            raise ValueError('Canonical package contract changed')
    if 'setNotificationDelegationEnabled(false)' not in canonical:
        raise ValueError('Canonical delegation contract changed')
    main_path = root / (BASE + '/qa2/MainApplication.kt')
    main = main_path.read_text()
    if not main.startswith('package com.urtruck.app.qa2\n') or main.count('PackageList(this).packages.apply {') != 1:
        raise ValueError('Unexpected generated application template')
    for name in PACKAGES:
        call = 'add(com.urtruck.app.' + name + '())'
        occurrences = len(re.findall(r'\b' + name + r'\s*\(', main))
        if occurrences and (occurrences != 1 or main.count(call) != 1):
            raise ValueError('Unexpected or duplicate package registration')
        if not occurrences:
            main = main.replace('PackageList(this).packages.apply {', 'PackageList(this).packages.apply {\n          ' + call, 1)
    if MARKER not in main:
        if 'setNotificationDelegationEnabled' in main or main.count('    loadReactNative(this)') != 1:
            raise ValueError('Unexpected application initialization policy')
        main = main.replace('    loadReactNative(this)', POLICY + '    loadReactNative(this)', 1)
    elif main.count(POLICY) != 1:
        raise ValueError('Unexpected restored delegation policy')
    canonical_gradle = git(repo, 'show', sha + ':android/app/build.gradle')
    for coordinate in ('com.google.firebase:firebase-messaging:25.0.1', 'me.leolin:ShortcutBadger:1.1.22@aar'):
        dependency = 'implementation("' + coordinate + '")'
        if canonical_gradle.count(dependency) != 1:
            raise ValueError('Canonical bridge dependency contract changed')
        artifact = coordinate.rsplit(':', 1)[0] + ':'
        matches = re.findall(r'["\'](' + re.escape(artifact) + r'[^"\']+)["\']', gradle)
        if matches and (matches != [coordinate] or gradle.count(dependency) != 1):
            raise ValueError('Unexpected or duplicate bridge dependency')
        if not matches:
            if gradle.count('dependencies {') != 1:
                raise ValueError('Unexpected generated dependency block')
            gradle = gradle.replace('dependencies {', 'dependencies {\n    ' + dependency, 1)
    changes = {main_path: main.encode(), root / 'android/app/build.gradle': gradle.encode()}
    for name in NAMES:
        content = subprocess.check_output(['git', '-C', str(repo), 'show', sha + ':' + BASE + '/' + name])
        if not content.startswith(b'package com.urtruck.app\n') or re.search(rb'\b(?:BuildConfig|R)\.', content):
            raise ValueError('Canonical class now depends on generated namespace')
        changes[root / (BASE + '/' + name)] = content
    return changes

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-sha', required=True)
    args = parser.parse_args()
    repo = Path.cwd()
    changes = plan(repo, repo, args.source_sha, os.environ)
    for path, content in changes.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists() or path.read_bytes() != content:
            path.write_bytes(content)
    print('QA2 canonical native bridges restored: 7 classes, 2 packages, FCM delegation policy')

if __name__ == '__main__':
    main()
