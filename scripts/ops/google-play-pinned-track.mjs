import { createSign } from 'node:crypto';

const PACKAGE = 'com.urtruck.app';
const VERSION_CODE = 214116271;
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const OAUTH_URL = 'https://oauth2.googleapis.com/token';
const API_ROOT = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}/edits`;

function fail(prefix, message) {
  throw new Error(`${prefix}: ${message}`);
}

async function jsonRequest(url, options, prefix) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    fail(prefix, 'Google API request failed before receiving a response');
  }
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  if (!response.ok) fail(prefix, `HTTP ${response.status}`);
  return body;
}

async function accessToken() {
  const raw = process.env.PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) fail('PLAY_AUTH_BLOCKED', 'Play service-account credential is unavailable');

  let account;
  try {
    account = JSON.parse(raw);
  } catch {
    fail('PLAY_AUTH_BLOCKED', 'Play service-account credential is not valid JSON');
  }
  if (!account.client_email || !account.private_key) {
    fail('PLAY_AUTH_BLOCKED', 'Play service-account credential is missing required fields');
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: account.client_email,
    scope: SCOPE,
    aud: OAUTH_URL,
    iat: issuedAt,
    exp: issuedAt + 3600,
  })}`;
  let assertion;
  try {
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    assertion = `${unsigned}.${signer.sign(account.private_key).toString('base64url')}`;
  } catch {
    fail('PLAY_AUTH_BLOCKED', 'Could not sign the service-account assertion');
  }

  const response = await jsonRequest(OAUTH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  }, 'PLAY_AUTH_BLOCKED');
  if (!response.access_token) fail('PLAY_AUTH_BLOCKED', 'OAuth response did not include an access token');
  return response.access_token;
}

async function api(token, path, options = {}, prefix = 'PLAY_API_BLOCKED') {
  return jsonRequest(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...options.headers,
    },
  }, prefix);
}

function getTarget() {
  const track = process.env.TARGET_TRACK || 'internal';
  const status = process.env.RELEASE_STATUS || 'draft';
  const fraction = (process.env.USER_FRACTION || '').trim();
  if (track === 'production' && status !== 'completed') {
    fail('PLAY_PREFLIGHT_BLOCKED', 'production promotion must be a completed 100% release after review');
  }
  if (track === 'production' && fraction) {
    fail('PLAY_PREFLIGHT_BLOCKED', 'user_fraction is not valid for the pinned completed production release');
  }
  return { track, status, fraction };
}

async function withEdit(token, prefix, callback) {
  const created = await api(token, '', { method: 'POST', body: '{}' }, prefix);
  const editId = created.id;
  if (!editId) fail(prefix, 'temporary edit id missing');
  let callbackError;
  let committed = false;
  try {
    return await callback(editId, () => { committed = true; });
  } catch (error) {
    callbackError = error;
    throw error;
  } finally {
    if (!committed) {
      const deleted = await fetch(`${API_ROOT}/${editId}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      }).catch(() => null);
      if (!deleted?.ok && !callbackError) fail(prefix, `temporary edit cleanup HTTP ${deleted?.status ?? 'unavailable'}`);
    }
  }
}

async function preflight() {
  const { track } = getTarget();
  const token = await accessToken();
  await withEdit(token, 'PLAY_PREFLIGHT_BLOCKED', async (editId) => {
    const response = await api(token, `/${editId}/tracks`, {}, 'PLAY_PREFLIGHT_BLOCKED');
    const snapshot = {};
    const allCodes = new Map();
    for (const row of response.tracks || []) {
      const name = String(row.track || '');
      snapshot[name] = [];
      for (const release of row.releases || []) {
        const codes = (release.versionCodes || []).map(Number);
        snapshot[name].push({ status: release.status, versionCodes: codes });
        for (const code of codes) {
          allCodes.set(code, [...(allCodes.get(code) || []), { track: name, status: release.status }]);
        }
      }
    }
    const locations = allCodes.get(VERSION_CODE) || [];
    if (locations.some((row) => row.track === track)) {
      fail('PLAY_PREFLIGHT_BLOCKED', `versionCode ${VERSION_CODE} already exists on requested track ${track}`);
    }
    if (track === 'production' && !locations.some((row) => row.track === 'internal' && row.status === 'completed')) {
      fail('PLAY_PREFLIGHT_BLOCKED', `versionCode ${VERSION_CODE} must first be completed on internal track`);
    }
    const unexpected = locations.filter((row) => !(track === 'production' && row.track === 'internal' && row.status === 'completed'));
    if (unexpected.length) {
      fail('PLAY_PREFLIGHT_BLOCKED', `versionCode ${VERSION_CODE} is present on incompatible track(s): ${[...new Set(unexpected.map((row) => row.track))].sort().join(',')}`);
    }
    const higher = [...allCodes.keys()].filter((code) => code > VERSION_CODE).sort((a, b) => a - b);
    if (higher.length) fail('PLAY_PREFLIGHT_BLOCKED', `newer Play versionCode(s) exist: ${higher.join(',')}`);
    console.log(`PLAY_TRACK_SNAPSHOT=${JSON.stringify(snapshot)}`);
    console.log(`PLAY_TARGET_TRACK=${track}; target_versionCode=${VERSION_CODE}; already_present_in_internal=${track === 'production' && locations.some((row) => row.track === 'internal' && row.status === 'completed')}`);
  });
}

async function promote() {
  const token = await accessToken();
  await withEdit(token, 'PLAY_PROMOTION_BLOCKED', async (editId, markCommitted) => {
    const data = await api(token, `/${editId}/tracks`, {}, 'PLAY_PROMOTION_BLOCKED');
    const internal = (data.tracks || []).find((track) => track.track === 'internal');
    const production = (data.tracks || []).find((track) => track.track === 'production');
    if (!internal || !production) fail('PLAY_PROMOTION_BLOCKED', 'expected internal/production tracks are unavailable');

    const availability = await api(token, `/${editId}/countryAvailability/production`, {}, 'PLAY_PROMOTION_BLOCKED');
    const countryCodes = [...new Set((availability.countries || []).map((country) => country.countryCode).filter(Boolean))].sort();
    const restOfWorld = Boolean(availability.restOfWorld);
    if (!countryCodes.length && !restOfWorld) fail('PLAY_PROMOTION_BLOCKED', 'production country availability is empty; refusing to broaden release');

    const internalCompleted = (internal.releases || []).some((release) => release.status === 'completed' && (release.versionCodes || []).map(Number).includes(VERSION_CODE));
    if (!internalCompleted) fail('PLAY_PROMOTION_BLOCKED', 'pinned versionCode is not completed on internal');
    const currentProduction = production.releases || [];
    if (currentProduction.some((release) => (release.versionCodes || []).map(Number).includes(VERSION_CODE))) {
      fail('PLAY_PROMOTION_BLOCKED', 'pinned versionCode is already listed on production; inspect current release before retry');
    }
    if (currentProduction.some((release) => ['draft', 'inProgress'].includes(release.status))) {
      fail('PLAY_PROMOTION_BLOCKED', 'production already has a draft or staged rollout; preserve it and resolve before promoting');
    }

    const release = {
      name: 'UrTruck 1.0.9 (214116271)',
      versionCodes: [VERSION_CODE],
      status: 'completed',
      inAppUpdatePriority: 2,
      releaseNotes: [
        { language: 'ru-RU', text: 'Теперь профиль можно сохранить без необязательного контакта в мессенджере. Улучшена обработка входа и сохранения профиля.' },
        { language: 'en-US', text: 'You can now save your profile without an optional messenger contact. Sign-in and profile saving have been improved.' },
      ],
    };
    const updated = { ...production, releases: [...currentProduction, release] };
    const result = await api(token, `/${editId}/tracks/production`, { method: 'PUT', body: JSON.stringify(updated) }, 'PLAY_PROMOTION_BLOCKED');
    if (!result.track) fail('PLAY_PROMOTION_BLOCKED', 'production track update response did not include a track');
    const committed = await jsonRequest(`${API_ROOT}/${editId}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
    }, 'PLAY_PROMOTION_BLOCKED');
    markCommitted();

    const verifyEdit = await api(token, '', { method: 'POST', body: '{}' }, 'POST_COMMIT_READBACK_FAILED');
    if (!verifyEdit.id) fail('POST_COMMIT_READBACK_FAILED', 'verification edit id missing; production release commit was accepted');
    try {
      const verifyAvailability = await api(token, `/${verifyEdit.id}/countryAvailability/production`, {}, 'POST_COMMIT_READBACK_FAILED');
      const normalize = (value) => JSON.stringify([
        Boolean(value.syncWithProduction),
        [...new Set((value.countries || []).map((country) => country.countryCode).filter(Boolean))].sort(),
        Boolean(value.restOfWorld),
      ]);
      if (normalize(verifyAvailability) !== normalize(availability)) {
        fail('POST_COMMIT_READBACK_FAILED', 'production country availability changed during submission; release commit was accepted');
      }
      const verifyTracks = await api(token, `/${verifyEdit.id}/tracks`, {}, 'POST_COMMIT_READBACK_FAILED');
      const published = (verifyTracks.tracks || []).find((track) => track.track === 'production');
      if (!(published?.releases || []).some((item) => item.status === 'completed' && (item.versionCodes || []).map(Number).includes(VERSION_CODE))) {
        fail('POST_COMMIT_READBACK_FAILED', 'production track readback did not contain the completed pinned version; release commit was accepted');
      }
    } finally {
      const deleted = await fetch(`${API_ROOT}/${verifyEdit.id}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }).catch(() => null);
      if (!deleted?.ok) fail('POST_COMMIT_READBACK_FAILED', `verification edit cleanup HTTP ${deleted?.status ?? 'unavailable'}; release commit was accepted`);
    }
    console.log(JSON.stringify({
      package: PACKAGE,
      track: 'production',
      versionCode: VERSION_CODE,
      status: 'completed',
      rolloutPercent: 100,
      source: 'existing completed internal release; no bundle upload or rebuild',
      productionCountryAvailabilityUnchanged: true,
      productionCountryCodes: countryCodes,
      productionRestOfWorld: restOfWorld,
      commitAccepted: Boolean(committed),
    }));
  });
}

const [mode] = process.argv.slice(2);
try {
  if (mode === 'preflight') await preflight();
  else if (mode === 'promote') await promote();
  else fail('PLAY_TOOL_BLOCKED', 'expected mode preflight or promote');
} catch (error) {
  console.error(error.message || 'PLAY_TOOL_BLOCKED: operation failed');
  process.exitCode = 1;
}
