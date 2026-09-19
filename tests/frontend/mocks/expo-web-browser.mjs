let result = { type: 'success', url: 'urtruck://auth-social?code=test-pkce-code-123' };
let calls = [];

export async function openAuthSessionAsync(url, redirectUrl) {
  calls.push({ url, redirectUrl });
  return result;
}

export function __setAuthSessionResult(next) {
  result = next;
}

export function __getAuthSessionCalls() {
  return [...calls];
}

export function __resetAuthSessionMock() {
  result = { type: 'success', url: 'urtruck://auth-social?code=test-pkce-code-123' };
  calls = [];
}
