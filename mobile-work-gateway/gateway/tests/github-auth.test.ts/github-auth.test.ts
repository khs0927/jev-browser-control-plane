import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { getGitHubToken, hasGitHubExecution, resetGitHubAuthCache } from '../src/github-auth.js';

function singleLine(pem: string): string {
  return pem.replace(/\r?\n/g, '');
}

test('legacy token counts as execution credential', () => {
  assert.equal(hasGitHubExecution({ GITHUB_TOKEN: 'test' }), true);
  assert.equal(hasGitHubExecution({}), false);
  assert.equal(hasGitHubExecution({ GITHUB_APP_ID: '1' }), false);
});

test('legacy token returns without network', async () => {
  resetGitHubAuthCache();
  const request = (async () => { throw Error('must_not_call'); }) as typeof fetch;
  assert.equal(await getGitHubToken({ GITHUB_TOKEN: 'legacy' }, request), 'legacy');
});

test('single-line PKCS1 key issues and caches installation token', async () => {
  resetGitHubAuthCache();
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pkcs1 = keys.privateKey.export({ type: 'pkcs1', format: 'pem' }) as string;
  assert.ok(pkcs1.indexOf('BEGIN RSA PRIVATE KEY') >= 0);
  const env = { GITHUB_APP_ID: '5309753', GITHUB_APP_INSTALLATION_ID: '171206577', GITHUB_APP_PRIVATE_KEY: singleLine(pkcs1) };
  let calls = 0;
  const request = (async () => {
    calls++;
    return Response.json({ token: 'installation-token', expires_at: new Date(Date.now() + 3600000).toISOString() });
  }) as typeof fetch;
  assert.equal(await getGitHubToken(env, request), 'installation-token');
  assert.equal(await getGitHubToken(env, request), 'installation-token');
  assert.equal(calls, 1);
  resetGitHubAuthCache();
});

test('missing credentials reject without secret details', async () => {
  resetGitHubAuthCache();
  const request = (async () => { throw Error('must_not_call'); }) as typeof fetch;
  await assert.rejects(() => getGitHubToken({}, request), /github_auth_failed/);
});






































