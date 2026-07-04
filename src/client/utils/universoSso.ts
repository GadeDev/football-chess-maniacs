const SSO_HASH_KEY = 'uf_sso';
const TOKEN_KEY = 'fcms_token';
const TOKEN_META_KEY = 'fcms_token_meta';

function decodeBase64UrlJson(value: string): Record<string, unknown> | null {
  try {
    const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function removeSsoHashParam(): void {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return;
  const params = new URLSearchParams(raw);
  if (!params.has(SSO_HASH_KEY)) return;
  params.delete(SSO_HASH_KEY);
  const nextHash = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash ? `#${nextHash}` : ''}`);
}

export function consumeUniversoSso(): string | null {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const encoded = params.get(SSO_HASH_KEY);
  if (!encoded) return null;

  try {
    const payload = decodeBase64UrlJson(encoded);
    const accessToken = typeof payload?.access_token === 'string' ? payload.access_token : '';
    if (!accessToken) return null;

    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(
      TOKEN_META_KEY,
      JSON.stringify({
        refreshToken: typeof payload?.refresh_token === 'string' ? payload.refresh_token : '',
        expiresIn: typeof payload?.expires_in === 'number' ? payload.expires_in : undefined,
        email: typeof payload?.email === 'string' ? payload.email : undefined,
        userId: typeof payload?.user_id === 'string' ? payload.user_id : undefined,
        importedAt: Date.now(),
        source: 'universo-futbol',
      }),
    );
    return accessToken;
  } finally {
    removeSsoHashParam();
  }
}
