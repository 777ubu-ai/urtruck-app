"""Согласует только identity в копии исходников на CI runner, без prebuild."""
import argparse
import json
import re
from pathlib import Path


def prepare(root, platform, version, source_sha, build_number=None):
    if not re.fullmatch(r'\d+\.\d+\.\d+', version) or not re.fullmatch(r'[0-9a-f]{40}', source_sha):
        raise ValueError('invalid_release_identity')
    root = Path(root)
    if build_number is not None:
        if platform != 'ios' or not re.fullmatch(r'[0-9]{1,4}', str(build_number)) or int(build_number) < 1:
            raise ValueError('invalid_ios_build_number')
        # Apple считает 001 и 1 одним номером; в native/config сохраняем 1.
        build_number = str(int(build_number))
    app_path = root / 'app.json'
    config = json.loads(app_path.read_text())
    app = config['expo']
    if app[platform].get('bundleIdentifier' if platform == 'ios' else 'package') != 'com.urtruck.app':
        raise ValueError('wrong_application_identifier')
    app['version'] = version
    if build_number is not None:
        app['ios']['buildNumber'] = build_number
    app.setdefault('extra', {}).update(urtruckSourceSha=source_sha, urtruckExternalFreightFeedEnabled=True)
    changes = {app_path: json.dumps(config, ensure_ascii=False, indent=2) + '\n'}
    if platform == 'ios':
        path = root / 'ios/UrTruck/Info.plist'
        text, count = re.subn(r'(<key>CFBundleShortVersionString</key>\s*<string>)[^<]+(</string>)',
                              lambda m: m[1] + version + m[2], path.read_text())
        if count != 1:
            raise ValueError('ambiguous_ios_version')
        if build_number is not None:
            text, count = re.subn(r'(<key>CFBundleVersion</key>\s*<string>)[^<]+(</string>)',
                                  lambda m: m[1] + build_number + m[2], text)
            if count != 1:
                raise ValueError('ambiguous_ios_build_number')
        changes[path] = text
        path = root / 'ios/UrTruck.xcodeproj/project.pbxproj'
        text, count = re.subn(r'(MARKETING_VERSION = )[^;]+;', lambda m: m[1] + version + ';', path.read_text())
        if count != 2:
            raise ValueError('ambiguous_ios_marketing_targets')
        if build_number is not None:
            text, count = re.subn(r'(CURRENT_PROJECT_VERSION = )[^;]+;',
                                  lambda m: m[1] + build_number + ';', text)
            if count != 2:
                raise ValueError('ambiguous_ios_build_targets')
        changes[path] = text
    elif platform == 'android':
        path = root / 'android/app/build.gradle'
        text, count = re.subn(r'(?m)^(\s*versionName ")[^"]+("\s*)$',
                              lambda m: m[1] + version + m[2], path.read_text())
        if count != 1:
            raise ValueError('ambiguous_android_version')
        changes[path] = text
    else:
        raise ValueError('unsupported_platform')
    # Сначала проверены все файлы; не оставляем частичную правку при неизвестной структуре.
    for path, text in changes.items():
        path.write_text(text)
    return {'platform': platform, 'version': version, 'source_sha': source_sha, 'external_feed': True,
            **({'build_number': build_number} if build_number is not None else {})}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', default='.')
    parser.add_argument('--platform', required=True, choices=('ios', 'android'))
    parser.add_argument('--version', required=True)
    parser.add_argument('--source-sha', required=True)
    parser.add_argument('--build-number')
    args = parser.parse_args()
    print(json.dumps(prepare(args.root, args.platform, args.version, args.source_sha, args.build_number)))
