// @vitest-environment jsdom
// ============================================================
// authClient.test.ts — refresh通知 / ensureFreshAccessToken / fcmsFetch（Issue #36）
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { refresh, onAuthChange, ensureFreshAccessToken, fcmsFetch } from '../authClient';
import { saveTokens, getAccessToken } from '../tokenStore';

function makeJwt(payload: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'RS256' })}.${b64url(payload)}.signature`;
}

/** 残りn秒で失効するアクセストークン */
function tokenExpiringIn(seconds: number, sub = 'u1'): string {
  return makeJwt({ sub, exp: Math.floor((Date.now() + seconds * 1000) / 1000) });
}

function authHeaderOf(init: RequestInit | undefined): string | null {
  return new Headers(init?.headers).get('Authorization');
}

describe('authClient (Issue #36)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('refresh', () => {
    it('成功時に onAuthChange リスナーへ true を通知する', async () => {
      saveTokens(tokenExpiringIn(10), 'rt-1');
      const fresh = tokenExpiringIn(900);
      vi.stubGlobal('fetch', vi.fn(async () =>
        new Response(JSON.stringify({ access_token: fresh, refresh_token: 'rt-2' }), { status: 200 })));

      const listener = vi.fn();
      const unsubscribe = onAuthChange(listener);
      try {
        expect(await refresh()).toBe(true);
      } finally {
        unsubscribe();
      }

      expect(listener).toHaveBeenCalledWith(true);
      expect(getAccessToken()).toBe(fresh);
    });
  });

  describe('ensureFreshAccessToken', () => {
    it('失効間近ならrefreshして新しいトークンを返す', async () => {
      saveTokens(tokenExpiringIn(30), 'rt-1');
      const fresh = tokenExpiringIn(900);
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ access_token: fresh, refresh_token: 'rt-2' }), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      expect(await ensureFreshAccessToken()).toBe(fresh);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toContain('/auth/refresh');
    });

    it('まだ失効しないならrefreshせず現在のトークンを返す', async () => {
      const token = tokenExpiringIn(900);
      saveTokens(token, 'rt-1');
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      expect(await ensureFreshAccessToken()).toBe(token);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('トークンが無ければnull（refreshもしない）', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      expect(await ensureFreshAccessToken()).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('refresh tokenが無くて失効済みならトークンを破棄してnull', async () => {
      saveTokens(tokenExpiringIn(-10));
      vi.stubGlobal('fetch', vi.fn());

      expect(await ensureFreshAccessToken()).toBeNull();
      expect(getAccessToken()).toBeNull();
    });
  });

  describe('fcmsFetch', () => {
    it('最新トークンをBearerで付与する', async () => {
      const token = tokenExpiringIn(900);
      saveTokens(token, 'rt-1');
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      await fcmsFetch('/api/teams');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toContain('/api/teams');
      expect(authHeaderOf(fetchMock.mock.calls[0][1])).toBe(`Bearer ${token}`);
    });

    it('トークンが無ければAuthorizationを付けない（公開API用）', async () => {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      await fcmsFetch('/api/ranking');
      expect(authHeaderOf(fetchMock.mock.calls[0][1])).toBeNull();
    });

    it('文字列bodyにContent-Type: application/jsonを補う', async () => {
      const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      await fcmsFetch('/match/com-report', { method: 'POST', body: JSON.stringify({ a: 1 }) });
      expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Content-Type')).toBe('application/json');
    });

    it('401 → refresh成功 → 新トークンで1回だけ再送する', async () => {
      const stale = tokenExpiringIn(900, 'u1');
      const fresh = tokenExpiringIn(900, 'u2');
      saveTokens(stale, 'rt-1');

      const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/auth/refresh')) {
          return new Response(JSON.stringify({ access_token: fresh, refresh_token: 'rt-2' }), { status: 200 });
        }
        // 最初の /api/teams だけ401、再送は200
        return new Response('{}', { status: getAccessToken() === fresh ? 200 : 401 });
      });
      vi.stubGlobal('fetch', fetchMock);

      const res = await fcmsFetch('/api/teams');
      expect(res.status).toBe(200);

      const apiCalls = fetchMock.mock.calls.filter(c => String(c[0]).includes('/api/teams'));
      expect(apiCalls).toHaveLength(2);
      expect(authHeaderOf(apiCalls[0][1])).toBe(`Bearer ${stale}`);
      expect(authHeaderOf(apiCalls[1][1])).toBe(`Bearer ${fresh}`);
    });

    it('401 → refresh失敗なら再送しない', async () => {
      saveTokens(tokenExpiringIn(900), 'rt-1');
      const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
        if (String(input).includes('/auth/refresh')) return new Response('{}', { status: 401 });
        return new Response('{}', { status: 401 });
      });
      vi.stubGlobal('fetch', fetchMock);

      const res = await fcmsFetch('/api/teams');
      expect(res.status).toBe(401);
      expect(fetchMock.mock.calls.filter(c => String(c[0]).includes('/api/teams'))).toHaveLength(1);
    });

    it('再送しても401ならそのまま返す（無限リトライしない）', async () => {
      saveTokens(tokenExpiringIn(900), 'rt-1');
      const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
        if (String(input).includes('/auth/refresh')) {
          return new Response(JSON.stringify({ access_token: tokenExpiringIn(900, 'u9'), refresh_token: 'rt-2' }), { status: 200 });
        }
        return new Response('{}', { status: 401 });
      });
      vi.stubGlobal('fetch', fetchMock);

      const res = await fcmsFetch('/api/teams');
      expect(res.status).toBe(401);
      expect(fetchMock.mock.calls.filter(c => String(c[0]).includes('/api/teams'))).toHaveLength(2);
    });

    it('fetch例外は握りつぶさず投げる', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
      await expect(fcmsFetch('/api/teams')).rejects.toThrow('offline');
    });
  });
});
