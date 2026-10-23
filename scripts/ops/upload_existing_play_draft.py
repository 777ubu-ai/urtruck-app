"""Загрузка одного проверенного AAB только в Internal draft, без сборки и review."""
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
VERSION = '214924807'
SHA256 = '599d2670a6f5ff813947f59e3beadbeb9d1336fa770ab930e09565dd000a411a'
SOURCE = 'b3823476b631519155d553595a1d0e8c58151363'
API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PACKAGE
UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/' + PACKAGE


def verify(root):
    metadata = json.loads((root / 'aab-run.json').read_text())
    required = {'id': 39959276862, 'head_sha': SOURCE, 'status': 'completed',
                'conclusion': 'success', 'event': 'workflow_dispatch',
                'path': '.github/workflows/deploy-play.yml'}
    if (any(metadata.get(key) != value for key, value in required.items())
            or metadata.get('repository', {}).get('full_name') != '777ubu-ai/urtruck-app'):
        raise ValueError('unexpected_artifact_provenance')
    with zipfile.ZipFile(root / 'aab.zip') as archive:
        entries = archive.infolist()
        if (len(entries) != 1 or Path(entries[0].filename).name != 'app-release.aab'
                or entries[0].file_size != 145323685):
            raise ValueError('unexpected_artifact_contents')
        data = archive.read(entries[0])
    if hashlib.sha256(data).hexdigest() != SHA256:
        raise ValueError('artifact_checksum_mismatch')
    return data


def draft_releases(track):
    if track.get('track') != 'internal':
        raise ValueError('unexpected_play_track')
    releases = []
    for release in track.get('releases', []):
        codes = [str(code) for code in release.get('versionCodes', [])]
        if release.get('status') == 'draft':
            if codes and codes != [VERSION]:
                raise ValueError('existing_other_internal_draft')
            continue
        if VERSION in codes:
            raise ValueError('candidate_already_active_do_not_modify')
        releases.append(release)
    return releases + [{'name': 'UrTruck 1.0.9 (' + VERSION + ')',
                        'versionCodes': [VERSION], 'status': 'draft'}]


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


def upload(data, call):
    edit = call(API + '/edits', 'POST', {})['id']
    base = API + '/edits/' + urllib.parse.quote(edit, safe='')
    track = call(base + '/tracks/internal')
    releases = draft_releases(track)
    bundles = call(base + '/bundles').get('bundles', [])
    matching = [bundle for bundle in bundles if str(bundle.get('versionCode')) == VERSION]
    if matching:
        if len(matching) != 1 or matching[0].get('sha256', '').lower() != SHA256:
            raise ValueError('existing_version_checksum_mismatch')
    else:
        bundle = call(UPLOAD + '/edits/' + urllib.parse.quote(edit, safe='') + '/bundles?uploadType=media',
                      'POST', data)
        if str(bundle.get('versionCode')) != VERSION or bundle.get('sha256', '').lower() != SHA256:
            raise ValueError('uploaded_bundle_identity_mismatch')
    result = call(base + '/tracks/internal', 'PUT', {'track': 'internal', 'releases': releases})
    if result.get('track') != 'internal' or result.get('releases') != releases:
        raise ValueError('draft_readback_mismatch')
    call(base + ':validate', 'POST')
    call(base + ':commit?changesNotSentForReview=true', 'POST')
    return {'status': 'INTERNAL_DRAFT_SAVED', 'package': PACKAGE, 'versionCode': VERSION,
            'source_sha': SOURCE, 'sha256': SHA256, 'edit_id': edit,
            'review_submitted': False, 'published': False}


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
