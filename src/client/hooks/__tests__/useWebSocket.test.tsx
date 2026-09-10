/* @vitest-environment jsdom */
// ============================================================
// useWebSocket.test.tsx — 接続直前のトークン鮮度確保（Issue #36）
// ============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';

const { ensureFreshAccessTokenMock } = vi.hoisted(() => ({
  ensureFreshAccessTokenMock: vi.fn<() => Promise<string | null>>(async () => 'fresh.jwt.token'),
}));
vi.mock('../../platform/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../platform/authClient')>();
  return { ...actual, ensureFreshAccessToken: ensureFreshAccessTokenMock };
});

import { useWebSocket } from '../useWebSocket';

const openedUrls: string[] = [];

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  constructor(url: string) { openedUrls.push(url); }
  send() {}
  close() { this.readyState = 3; }
}

/** connect の内部awaitが解決するまでマイクロタスクを流す */
async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe('useWebSocket token freshness (Issue #36)', () => {
  beforeEach(() => {
    openedUrls.length = 0;
    ensureFreshAccessTokenMock.mockReset();
    ensureFreshAccessTokenMock.mockResolvedValue('fresh.jwt.token');
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('JWT形状のトークンでは接続前にrefreshし、最新トークンで接続する', async () => {
    const { result } = renderHook(() => useWebSocket({
      url: 'ws://localhost:8787/match/m1/ws',
      token: 'stale.jwt.token',
      onMessage: () => {},
      autoReconnect: false,
    }));

    act(() => { result.current.connect(); });
    await flush();

    expect(ensureFreshAccessTokenMock).toHaveBeenCalledTimes(1);
    expect(openedUrls).toHaveLength(1);
    expect(openedUrls[0]).toContain('token=fresh.jwt.token');
  });

  it('UUID形状のトークン（サーバーCOM/自己対戦席）ではrefreshしない', async () => {
    const uuid = '3f1c9c1e-2b7a-4a1d-9a3e-0d1f2b3c4d5e';
    const { result } = renderHook(() => useWebSocket({
      url: 'ws://localhost:8787/match/com_1/ws',
      token: uuid,
      onMessage: () => {},
      autoReconnect: false,
    }));

    act(() => { result.current.connect(); });
    await flush();

    expect(ensureFreshAccessTokenMock).not.toHaveBeenCalled();
    expect(openedUrls[0]).toContain(`token=${encodeURIComponent(uuid)}`);
  });

  it('トークン取得中にdisconnectされたら接続しない', async () => {
    const { result } = renderHook(() => useWebSocket({
      url: 'ws://localhost:8787/match/m1/ws',
      token: 'stale.jwt.token',
      onMessage: () => {},
      autoReconnect: false,
    }));

    act(() => {
      result.current.connect();
      result.current.disconnect();
    });
    await flush();

    expect(openedUrls).toHaveLength(0);
  });

  it('token propが変わってもconnect/disconnectのidentityは変わらない（試合中のWS再接続を防ぐ）', async () => {
    // refresh 成功で AuthContext の accessToken が変わると呼び出し元は再レンダーされる。
    // その際 connect の identity が変わると Battle/Matching の useEffect が
    // 「切断→再接続」を実行してしまうため、identity は token に依存してはならない。
    ensureFreshAccessTokenMock.mockResolvedValue(null); // 鮮度確保は素通しにして prop の値を観察する
    const { result, rerender } = renderHook(
      ({ token }) => useWebSocket({
        url: 'ws://localhost:8787/match/m1/ws',
        token,
        onMessage: () => {},
        autoReconnect: false,
      }),
      { initialProps: { token: 'first.jwt.token' } },
    );
    const connectBefore = result.current.connect;
    const disconnectBefore = result.current.disconnect;

    rerender({ token: 'second.jwt.token' });

    expect(result.current.connect).toBe(connectBefore);
    expect(result.current.disconnect).toBe(disconnectBefore);

    // ただし次に接続するときは最新の token prop を使う
    act(() => { result.current.connect(); });
    await flush();
    expect(openedUrls).toHaveLength(1);
    expect(openedUrls[0]).toContain('token=second.jwt.token');
  });
});
