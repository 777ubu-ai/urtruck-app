"""Проверка privacy metadata фактического IPA перед загрузкой Apple."""
import argparse
import plistlib
import zipfile


def verify(path):
    with zipfile.ZipFile(path) as archive:
        names = [name for name in archive.namelist()
                 if name.startswith('Payload/') and name.endswith('.app/Info.plist')
                 and name.count('/') == 2]
        if len(names) != 1:
            raise ValueError('ios_application_info_not_unique')
        info = plistlib.loads(archive.read(names[0]))
    purpose = info.get('NSMotionUsageDescription')
    if not isinstance(purpose, str) or not purpose.strip():
        raise ValueError('ios_motion_purpose_missing_90683')
    return {key: info.get(key) for key in
            ['CFBundleIdentifier', 'CFBundleShortVersionString', 'CFBundleVersion',
             'NSMotionUsageDescription']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('ipa')
    args = parser.parse_args()
    print(verify(args.ipa))
