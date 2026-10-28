"""Загрузка одного проверенного AAB в библиотеку; все releases остаются прежними."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

PACKAGE = 'com.urtruck.app'
VERSION = '215090229'
SHA256 = '68a2fa53a4c5781cafdf5a38ea9157bd9d2fcedae0de12535f06ebd9f7f68a09'
SOURCE = 'a25622c2987c6adec17fd35a8182947ecb0535a7'
API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PACKAGE
UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/' + PACKAGE


def verify(root):
    metadata = json.loads((root / 'aab-run.json').read_text())
    required = {'id': 40731167085, 'head_sha': SOURCE, 'status': 'completed',
                'conclusion': 'success', 'event': 'workflow_dispatch',
                'path': '.github/workflows/deploy-play.yml'}
    if (any(metadata.get(key) != value for key, value in required.items())
            or metadata.get('repository', {}).get('full_name') != '777ubu-ai/urtruck-app'):
        raise ValueError('unexpected_artifact_provenance')
    with zipfile.ZipFile(root / 'aab.zip') as archive:
        entries = archive.infolist()
        if (len(entries) != 1 or Path(entries[0].filename).name != 'app-release.aab'
                or entries[0].file_size != 145331173):
            raise ValueError('unexpected_artifact_contents')
        data = archive.read(entries[0])
    if hashlib.sha256(data).hexdigest() != SHA256:
        raise ValueError('artifact_checksum_mismatch')
    return data


def request_json(url, method='GET', data=None, headers=None):
    request = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Ответ может содержать сведения аккаунта; выводим только HTTP status.
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=['verify', 'upload'])
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
    print(json.dumps(upload(data, call)))


if __name__ == '__main__':
    main()
