import { afterEach, describe, expect, it, vi } from 'vitest';
import { callPlatformApi } from '../auth';
import type { Env } from '../../worker';

function env(overrides: Partial<Env['Bindings']> = {}): Env['Bindings'] {
  return {
    PLATFORM_API_BASE: 'https://platform.example.test/api',
    PLATFORM_SERVICE_API_KEY: 'service-key',
    PLATFORM_HMAC_SECRET: 'secret',
    ...overrides,
  } as Env['Bindings'];
}

async function hmac(body: string, secret = 'secret'): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('callPlatformApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('URL APIでbase/pathを結合しHMAC検証する', async () => {
    const body = JSON.stringify({ ok: true });
    const signature = await hmac(body);
    const fetchMock = vi.fn(async () => new Response(body, {
      status: 200,
      headers: { 'X-HMAC-Signature': signature },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await callPlatformApi<{ ok: boolean }>(env(), '/users/u1');
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://platform.example.test/api/users/u1',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Service-API-Key': 'service-key' }),
      }),
    );
  });

  it('http base URL を拒否する', async () => {
    await expect(callPlatformApi(env({ PLATFORM_API_BASE: 'http://platform.example.test' }), '/users/u1'))
      .rejects.toThrow('PLATFORM_API_BASE must use https');
  });

  it('localhost http は明示フラグがある場合だけ許可する', async () => {
    const body = JSON.stringify({ ok: true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {
      status: 200,
      headers: { 'X-HMAC-Signature': await hmac(body) },
    })));

    await expect(callPlatformApi(env({
      PLATFORM_API_BASE: 'http://localhost:8787',
      ALLOW_INSECURE_PLATFORM_API: 'true',
    }), '/health')).resolves.toEqual({ ok: true });
  });

  it('絶対URL pathを拒否する', async () => {
    await expect(callPlatformApi(env(), 'https://evil.example/steal'))
      .rejects.toThrow('Platform API path must be relative');
  });

  it('timeout時はPlatform API timeoutを投げる', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })));

    await expect(callPlatformApi(env(), '/slow', { timeoutMs: 1 }))
      .rejects.toThrow('Platform API timeout');
  });
});
