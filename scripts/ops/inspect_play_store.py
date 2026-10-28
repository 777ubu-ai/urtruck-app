"""Сверяет номера Play во временном edit без upload, commit и смены треков."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re

BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.urtruck.app/edits'


def checked(response):
    if response.status_code not in (200, 201, 204):
        raise RuntimeError(f'Google Play HTTP {response.status_code}')
    return response.json() if response.status_code != 204 else {}


def code(value):
    if isinstance(value, bool) or not re.fullmatch(r'[1-9][0-9]{0,9}', str(value)):
        raise ValueError('Неверный versionCode в ответе Play')
    number = int(value)
    if number >= 2100000000:
        raise ValueError('versionCode вне диапазона Play')
    return number


def snapshot(session):
    edit = checked(session.post(BASE, json={}, timeout=30))['id']
    if not re.fullmatch(r'[A-Za-z0-9_-]+', str(edit)):
        raise ValueError('Неверный идентификатор edit')
    url = BASE + '/' + str(edit)
    try:
        tracks = checked(session.get(url + '/tracks', timeout=30)).get('tracks', [])
        bundles = checked(session.get(url + '/bundles', timeout=30)).get('bundles', [])
        apks = checked(session.get(url + '/apks', timeout=30)).get('apks', [])
        numbers = {code(row['versionCode']) for row in bundles + apks}
        safe_tracks = []
        for track in tracks:
            releases = []
            for release in track.get('releases', []):
                versions = [code(value) for value in release.get('versionCodes', [])]
                numbers.update(versions)
                releases.append({'name': release.get('name'), 'status': release['status'],
                                 'version_codes': versions, 'user_fraction': release.get('userFraction')})
            safe_tracks.append({'track': track['track'], 'releases': releases})
        if not numbers:
            raise ValueError('Play не вернул использованные номера; новый номер не выбран')
        maximum = max(numbers)
        result = {'checked_at': datetime.now(timezone.utc).isoformat(),
                  'package': 'com.urtruck.app', 'tracks': safe_tracks,
                  'maximum_current_version_code': maximum,
                  'proposed_next_version_code': code(maximum + 1),
                  'bundle_count': len(bundles), 'apk_count': len(apks),
                  'upload_performed': False, 'edit_committed': False,
                  'counter_recheck_required_before_build': True}
    finally:
        checked(session.delete(url, timeout=30))
    return {**result, 'temporary_edit_deleted': True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    # Импорт только для настоящего API-вызова; unit tests не требуют credentials.
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession
    credentials = service_account.Credentials.from_service_account_info(
        json.loads(os.environ['PLAY_SERVICE_ACCOUNT_JSON']),
        scopes=['https://www.googleapis.com/auth/androidpublisher'])
    with AuthorizedSession(credentials) as session:
        result = snapshot(session)
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
