"""Раздельные явные операции: сохранение AAB и отправка исправленного production-релиза."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

PACKAGE = 'com.urtruck.app'
VERSION = '215090230'
SHA256 = '2b77d67f7dff25815994af7df792f5695147dc9fa952ca2497991b4418b30a83'
SOURCE = '23716b734d358383902bdb8ef3ddd63122bd4b42'
APP_SOURCE = '6aa6badf3ddfd8d124268c8cecf7c5e202c0baca'
API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PACKAGE
UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/' + PACKAGE


def verify(root):
    metadata = json.loads((root / 'aab-run.json').read_text())
    required = {'id': 40776684461, 'head_sha': SOURCE, 'status': 'completed',
                'conclusion': 'success', 'event': 'workflow_dispatch',
                'path': '.github/workflows/deploy-play.yml'}
    if (any(metadata.get(key) != value for key, value in required.items())
            or metadata.get('repository', {}).get('full_name') != '777ubu-ai/urtruck-app'):
        raise ValueError('unexpected_artifact_provenance')
    with zipfile.ZipFile(root / 'aab.zip') as archive:
        entries = archive.infolist()
        if (len(entries) != 1 or Path(entries[0].filename).name != 'app-release.aab'
                or entries[0].file_size != 145333018):
            raise ValueError('unexpected_artifact_contents')
        data = archive.read(entries[0])
    if hashlib.sha256(data).hexdigest() != SHA256:
        raise ValueError('artifact_checksum_mismatch')
    return data


def safe_provider_error(error, url, headers, data):
    """Сохраняет причину отказа Google, исключая credentials и управляющие символы."""
    try:
        body = json.loads(error.read(16384))
    except (ValueError, OSError):
        body = {}
    details = body.get('error') if isinstance(body, dict) else {}
    details = details if isinstance(details, dict) else {}
    secrets = []
    auth = (headers or {}).get('Authorization', '')
    if auth:
        secrets.extend((auth, auth.removeprefix('Bearer ')))
    if urllib.parse.urlsplit(url).hostname == 'oauth2.googleapis.com' and data:
        try:
            secrets.extend(urllib.parse.parse_qs(data.decode()).get('assertion', []))
        except (UnicodeError, AttributeError):
            pass
    def redact(value, limit):
        text = str(value or '')
        for secret in secrets:
            if secret:
                text = text.replace(secret, '[redacted]')
        text = re.sub(r'-----BEGIN[^-]*PRIVATE KEY-----[\s\S]*?(?:-----END[^-]*PRIVATE KEY-----|$)', '[redacted-key]', text)
        text = re.sub(r'(?i)Bearer\s+[^\s"<>]+', 'Bearer [redacted]', text)
        text = re.sub(r'sk-[A-Za-z0-9_-]+', '[redacted-key]', text)
        text = re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[redacted-jwt]', text)
        text = re.sub(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[redacted-email]', text)
        return re.sub(r'[\x00-\x1f\x7f]', ' ', text)[:limit]
    rows = details.get('errors') or []
    reason = rows[0].get('reason') if rows and isinstance(rows[0], dict) else details.get('status')
    return {'status': 'GOOGLE_PLAY_REQUEST_REJECTED', 'http_status': error.code,
            'stage': urllib.parse.urlsplit(url).path.rsplit('/', 1)[-1],
            'reason': redact(reason, 120), 'message': redact(details.get('message'), 1200)}


def request_json(url, method='GET', data=None, headers=None):
    request = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        print(json.dumps(safe_provider_error(error, url, headers, data), ensure_ascii=False))
        raise RuntimeError('play_http_' + str(error.code)) from None


def access_token():
    account = json.loads(os.environ['PLAY_SERVICE_ACCOUNT_JSON'])
    if account.get('type') != 'service_account' or account.get('token_uri') != 'https://oauth2.googleapis.com/token':
        raise ValueError('unexpected_existing_play_credential')
    encode = lambda value: base64.urlsafe_b64encode(value).rstrip(b'=')
    now = int(time.time())
    claims = {'iss': account['client_email'], 'scope': 'https://www.googleapis.com/auth/androidpublisher',
              'aud': account['token_uri'], 'iat': now, 'exp': now + 600}
    unsigned = b'.'.join(encode(json.dumps(item, separators=(',', ':')).encode())
                         for item in [{'alg': 'RS256', 'typ': 'JWT'}, claims])
    with tempfile.TemporaryDirectory(prefix='play-upload-key-') as folder:
        key = Path(folder) / 'key.pem'
        descriptor = os.open(key, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'w') as stream:
            stream.write(account['private_key'])
        signed = subprocess.run(['openssl', 'dgst', '-sha256', '-sign', str(key)], input=unsigned,
                                check=True, capture_output=True).stdout
    assertion = (unsigned + b'.' + encode(signed)).decode()
    response = request_json(account['token_uri'], 'POST', urllib.parse.urlencode({
        'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion': assertion}).encode(),
        {'Content-Type': 'application/x-www-form-urlencoded'})
    return response['access_token']


def confirm_saved_bundle(call, track):
    """Новая транзакция только читает сохранённую библиотеку и прежний трек."""
    readback_id = call(API + '/edits', 'POST', {})['id']
    readback = API + '/edits/' + urllib.parse.quote(readback_id, safe='')
    saved = [bundle for bundle in call(readback + '/bundles').get('bundles', [])
             if str(bundle.get('versionCode')) == VERSION]
    if len(saved) != 1 or saved[0].get('sha256', '').lower() != SHA256:
        raise ValueError('committed_bundle_readback_mismatch')
    if call(readback + '/tracks/internal') != track:
        raise ValueError('committed_internal_track_changed')


def upload(data, call):
    edit = call(API + '/edits', 'POST', {})['id']
    base = API + '/edits/' + urllib.parse.quote(edit, safe='')
    track = call(base + '/tracks/internal')
    if track.get('track') != 'internal':
        raise ValueError('unexpected_play_track')
    bundles = call(base + '/bundles').get('bundles', [])
    matching = [bundle for bundle in bundles if str(bundle.get('versionCode')) == VERSION]
    if matching:
        if len(matching) != 1 or matching[0].get('sha256', '').lower() != SHA256:
            raise ValueError('existing_version_checksum_mismatch')
        # Совпадающий файл уже в сохранённой библиотеке: лишний commit не нужен.
        confirm_saved_bundle(call, track)
        commit_state = 'ALREADY_SAVED'
    else:
        bundle = call(UPLOAD + '/edits/' + urllib.parse.quote(edit, safe='') + '/bundles?uploadType=media',
                      'POST', data)
        if str(bundle.get('versionCode')) != VERSION or bundle.get('sha256', '').lower() != SHA256:
            raise ValueError('uploaded_bundle_identity_mismatch')
        if call(base + '/tracks/internal') != track:
            raise ValueError('existing_internal_track_changed')
        call(base + ':validate', 'POST')
        try:
            call(base + ':commit?changesNotSentForReview=true&changesInReviewBehavior=ERROR_IF_IN_REVIEW', 'POST')
            commit_state = 'COMMIT_CONFIRMED'
        except (urllib.error.URLError, TimeoutError):
            # Потеря ответа не разрешает повторять upload/commit: сначала read-only сверка.
            confirm_saved_bundle(call, track)
            commit_state = 'RESPONSE_LOST_READBACK_CONFIRMED'
        else:
            confirm_saved_bundle(call, track)
    return {'status': 'BUNDLE_LIBRARY_SAVED', 'package': PACKAGE, 'versionCode': VERSION,
            'source_sha': SOURCE, 'sha256': SHA256, 'edit_id': edit,
            'commit_state': commit_state,
            'internal_track_unchanged': True, 'assigned_by_this_operation': False,
            'existing_internal_statuses': [release.get('status') for release in track.get('releases', [])
                if VERSION in [str(code) for code in release.get('versionCodes', [])]],
            'review_submitted_by_this_operation': False, 'published_by_this_operation': False}


def all_tracks(call, base):
    rows = call(base + '/tracks').get('tracks', [])
    tracks = {row['track']: row for row in rows}
    if len(tracks) != len(rows) or 'production' not in tracks:
        raise ValueError('unexpected_tracks_snapshot')
    return tracks


def submit_production(data, call):
    """Явная отправка одного исправленного бинарника в основной магазин."""
    if int(VERSION) <= 215090229:
        raise ValueError('registration_fix_binary_required')
    edit = call(API + '/edits', 'POST', {})['id']
    base = API + '/edits/' + urllib.parse.quote(edit, safe='')
    original = all_tracks(call, base)
    bundles = call(base + '/bundles').get('bundles', [])
    matching = [item for item in bundles if str(item.get('versionCode')) == VERSION]
    if matching and (len(matching) != 1 or matching[0].get('sha256', '').lower() != SHA256):
        raise ValueError('existing_version_checksum_mismatch')
    release = {'name': '1.0.13', 'status': 'completed', 'versionCodes': [VERSION],
               'releaseNotes': [{'language': 'ru-RU', 'text': 'Улучшены ленты, счётчики и каталог перевозчиков. Исправлены регистрация, сохранение роли и смена аккаунта. Повышена стабильность чата и перевода.'}]}
    desired = {'track': 'production', 'releases': [release]}
    for name, track in original.items():
        for item in track.get('releases', []):
            codes = [str(code) for code in item.get('versionCodes', [])]
            if item.get('status') != 'completed':
                raise ValueError('unfinished_existing_release')
            if name != 'production' and VERSION in codes:
                raise ValueError('candidate_assigned_to_another_track')
    existing = original['production'].get('releases', [])
    already = (len(existing) == 1 and existing[0].get('status') == 'completed'
               and existing[0].get('name') == '1.0.13'
               and [str(code) for code in existing[0].get('versionCodes', [])] == [VERSION])
    if already:
        if not matching:
            raise ValueError('assigned_bundle_missing')
        return {'status': 'PRODUCTION_ASSIGNMENT_ALREADY_PRESENT', 'versionCode': VERSION,
                'sha256': SHA256, 'review_requested_by_this_operation': False,
                'public_availability_confirmed': False}
    if any(int(code) >= int(VERSION) for item in existing for code in item.get('versionCodes', [])):
        raise ValueError('production_version_conflict')
    if not matching:
        result = call(UPLOAD + '/edits/' + urllib.parse.quote(edit, safe='') + '/bundles?uploadType=media', 'POST', data)
        if str(result.get('versionCode')) != VERSION or result.get('sha256', '').lower() != SHA256:
            raise ValueError('uploaded_bundle_identity_mismatch')
    if all_tracks(call, base) != original:
        raise ValueError('tracks_changed_before_assignment')
    call(base + '/tracks/production', 'PUT', desired)
    expected = {**original, 'production': desired}
    if all_tracks(call, base) != expected:
        raise ValueError('tracks_changed_before_commit')
    call(base + ':validate', 'POST')
    commit_state = 'COMMIT_CONFIRMED'
    try:
        call(base + ':commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW', 'POST')
    except (urllib.error.URLError, TimeoutError):
        commit_state = 'RESPONSE_LOST_READBACK_CONFIRMED'
    readback_id = call(API + '/edits', 'POST', {})['id']
    readback = API + '/edits/' + urllib.parse.quote(readback_id, safe='')
    saved = [item for item in call(readback + '/bundles').get('bundles', [])
             if str(item.get('versionCode')) == VERSION]
    if len(saved) != 1 or saved[0].get('sha256', '').lower() != SHA256:
        raise ValueError('production_bundle_readback_mismatch')
    if all_tracks(call, readback) != expected:
        raise ValueError('production_tracks_readback_mismatch')
    return {'status': 'PRODUCTION_RELEASE_SUBMITTED', 'package': PACKAGE, 'versionCode': VERSION,
            'sha256': SHA256, 'source_sha': SOURCE, 'app_source_sha': APP_SOURCE, 'edit_id': edit, 'commit_state': commit_state,
            'production_status': 'completed', 'other_tracks_unchanged': True,
            'review_requested_by_this_operation': True, 'public_availability_confirmed': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=['verify', 'upload', 'submit-production'])
    parser.add_argument('--root', type=Path, required=True)
    args = parser.parse_args()
    data = verify(args.root)
    if args.operation == 'verify':
        print(json.dumps({'artifact': 'VERIFIED', 'sha256': SHA256, 'source_sha': SOURCE}))
        return
    token = access_token()
    def call(url, method='GET', payload=None):
        raw = isinstance(payload, bytes)
        body = payload if raw or payload is None else json.dumps(payload).encode()
        return request_json(url, method, body, {'Authorization': 'Bearer ' + token,
                            'Content-Type': 'application/octet-stream' if raw else 'application/json'})
    operation = submit_production if args.operation == 'submit-production' else upload
    print(json.dumps(operation(data, call)))


if __name__ == '__main__':
    main()
