// Подготовка выбранного VALID build к App Review. Не снимает rejection и не отправляет review.
import fs from 'node:fs';
import crypto from 'node:crypto';

const action = process.env.ASC_ACTION || 'inspect';
if (!['inspect', 'prepare'].includes(action)) throw new Error('Unsupported ASC_ACTION');
const buildNumber = process.env.ASC_BUILD_NUMBER;
if (!/^\d+$/.test(buildNumber || '')) throw new Error('ASC_BUILD_NUMBER required');
const credentials = JSON.parse(fs.readFileSync(process.env.ASC_CREDENTIALS_FILE, 'utf8'));
const appId = '6764504167';
const now = Math.floor(Date.now() / 1000);
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const payload = encode({ alg: 'ES256', kid: credentials.keyIdentifier, typ: 'JWT' }) + '.'
  + encode({ iss: credentials.issuerIdentifier, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' });
const jwt = payload + '.' + crypto.sign('sha256', Buffer.from(payload), {
  key: credentials.keyP8, dsaEncoding: 'ieee-p1363',
}).toString('base64url');
async function api(path, method = 'GET', body) {
  const response = await fetch('https://api.appstoreconnect.apple.com/v1/' + path, {
    method, headers: { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
  });
  const value = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error('ASC HTTP ' + response.status + ': '
    + (value?.errors || []).map(error => error.code + ': ' + error.detail).join('; '));
  return value;
}
const app = await api('apps/' + appId);
if (app.data.attributes.bundleId !== 'com.urtruck.app') throw new Error('Wrong bundle');
const versions = await api('apps/' + appId + '/appStoreVersions?filter[platform]=IOS&include=build&limit=20');
const matches = versions.data.filter(version => version.attributes.versionString === '1.0.9');
if (matches.length !== 1) throw new Error('Ambiguous marketing version');
const before = matches[0];
const builds = await api('builds?filter[app]=' + appId + '&filter[version]=' + buildNumber + '&include=preReleaseVersion');
if (builds.data.length !== 1) {
  if (action === 'inspect') {
    const latest = await api('builds?filter[app]=' + appId + '&limit=200');
    console.log(JSON.stringify({ action, target: buildNumber, matchingBuilds: builds.data.length,
      available: latest.data.slice(0,5).map(value => ({ number: value.attributes.version, state: value.attributes.processingState, uploadedDate: value.attributes.uploadedDate })) }));
    process.exit(0);
  }
  throw new Error('Target build unavailable or ambiguous');
}
const build = builds.data[0];
const release = builds.included?.find(value => value.type === 'preReleaseVersions'
  && value.id === build.relationships.preReleaseVersion.data.id);
if (build.attributes.processingState !== 'VALID' || build.attributes.expired
  || release?.attributes.version !== '1.0.9' || release?.attributes.platform !== 'IOS') {
  throw new Error('Target build not VALID 1.0.9 IOS');
}
const snapshot = { time: new Date().toISOString(), action, before, target: build, reviewSubmitted: false, publicationPerformed: false };
const outputPath = process.env.ASC_PREPARATION_RECORD;
if (action === 'prepare') {
  if (!outputPath || fs.existsSync(outputPath)) throw new Error('Unique private record path required');
  if (!['REJECTED', 'PREPARE_FOR_SUBMISSION'].includes(before.attributes.appStoreState)) {
    throw new Error('Review state changed; no cancellation allowed');
  }
  const previous = versions.included?.find(value => value.type === 'builds' && value.id === before.relationships.build.data?.id);
  if (previous && Number(previous.attributes.version) > Number(buildNumber)) throw new Error('Refusing build downgrade');
  const save = () => fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  save();
  if (before.relationships.build.data?.id !== build.id) {
    await api('appStoreVersions/' + before.id + '/relationships/build', 'PATCH', { data: { type: 'builds', id: build.id } });
    snapshot.buildAttached = true; save();
  }
  await api('appStoreVersions/' + before.id, 'PATCH', {
    data: { type: 'appStoreVersions', id: before.id, attributes: { releaseType: 'AFTER_APPROVAL' } },
  });
  snapshot.after = await api('appStoreVersions/' + before.id + '?include=build');
  if (snapshot.after.data.relationships.build.data?.id !== build.id
    || snapshot.after.data.attributes.releaseType !== 'AFTER_APPROVAL') throw new Error('Preparation verification failed');
  save();
}
console.log(JSON.stringify({ version: '1.0.9', buildNumber, buildId: build.id,
  processingState: build.attributes.processingState, action,
  versionState: snapshot.after?.data.attributes.appStoreState || before.attributes.appStoreState,
  releaseType: snapshot.after?.data.attributes.releaseType || before.attributes.releaseType,
  reviewSubmitted: false, publicationPerformed: false }));
