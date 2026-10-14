// GitHub App installation auth for Mobile Work Gateway.
// Supports single-line PEM and PKCS1/PKCS8 without logging secrets.
// GITHUB_TOKEN remains as legacy compat only.

export interface AppAuthEnv {
  GITHUB_TOKEN?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_INSTALLATION_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
}

let cachedToken = '';
let cachedExpiresAt = 0;

export function hasGitHubExecution(env: AppAuthEnv): boolean {
  if (env.GITHUB_TOKEN) return true;
  return Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_INSTALLATION_ID && env.GITHUB_APP_PRIVATE_KEY);
}

function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): { der: Uint8Array; isPkcs1: boolean } {
  const trimmed = pem.trim();
  const isPkcs1 = trimmed.indexOf('BEGIN RSA PRIVATE KEY') >= 0;
  const b64 = trimmed.replace(/-----BEGIN [^-]*-----/g, '').replace(/-----END [^-]*-----/g, '').replace(/\s+/g, '');
  if (!b64) throw Error('github_auth_failed');
  const binary = atob(b64);
  const der = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) der[i] = binary.charCodeAt(i);
  return { der, isPkcs1 };
}

function encodeLength(len: number): number[] {
  if (len < 128) return [len];
  const bytes: number[] = [];
  let n = len;
  while (n > 0) { bytes.unshift(n & 0xff); n >>= 8; }
  const out = [0x80 | bytes.length];
  for (let i = 0; i < bytes.length; i++) out.push(bytes[i]);
  return out;
}

function wrapPkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const oid = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const version = [0x02, 0x01, 0x00];
  const algHead = [0x30].concat(encodeLength(oid.length)).concat(oid);
  const octetHead = [0x04].concat(encodeLength(pkcs1.length));
  const body = version.concat(algHead).concat(octetHead);
  for (let i = 0; i < pkcs1.length; i++) body.push(pkcs1[i]);
  return new Uint8Array([0x30].concat(encodeLength(body.length)).concat(body));
}

async function importAppKey(pem: string): Promise<CryptoKey> {
  const parsed = pemToDer(pem);
  const pkcs8 = parsed.isPkcs1 ? wrapPkcs1ToPkcs8(parsed.der) : parsed.der;
  const keyData = new Uint8Array(pkcs8).buffer;
  return crypto.subtle.importKey('pkcs8', keyData, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

async function createAppJwt(appId: string, pem: string): Promise<string> {
  const key = await importAppKey(pem);
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
  const unsignedToken = header + '.' + payload;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsignedToken));
  return unsignedToken + '.' + base64UrlEncode(new Uint8Array(sig));
}

export async function getGitHubToken(env: AppAuthEnv, request: typeof fetch = fetch): Promise<string> {
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN;
  const appId = env.GITHUB_APP_ID;
  const installationId = env.GITHUB_APP_INSTALLATION_ID;
  const privateKey = env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !installationId || !privateKey) throw Error('github_auth_failed');
  if (cachedToken && Date.now() < cachedExpiresAt) return cachedToken;
  let jwt = '';
  try {
    jwt = await createAppJwt(appId, privateKey);
  } catch {
    throw Error('github_auth_failed');
  }
  const response = await request('https://api.github.com/app/installations/' + installationId + '/access_tokens', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + jwt, Accept: 'application/vnd.github+json', 'User-Agent': 'MobileWorkGateway', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error('github_auth_failed');
  const body = (await response.json()) as { token?: string; expires_at?: string };
  if (!body.token) throw Error('github_auth_failed');
  cachedExpiresAt = body.expires_at ? Date.parse(body.expires_at) - 60000 : Date.now() + 50 * 60 * 1000;
  cachedToken = body.token;
  return cachedToken;
}

export function resetGitHubAuthCache(): void {
  cachedToken = '';
  cachedExpiresAt = 0;
}
