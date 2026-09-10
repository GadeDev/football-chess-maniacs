/* @vitest-environment jsdom */
// ============================================================
// AuthContext.test.tsx — 失効トークンでの起動挙動（Issue #36）
// ============================================================

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

// refresh はネットワークを叩かせない。onAuthChange/logout は実物のままにする。
// （vi.mock はホイストされるので、モック本体は vi.hoisted で先に作る）
const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn(async () => true) }));
vi.mock('../../platform/authClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../platform/authClient')>();
  return { ...actual, refresh: refreshMock };
});

import { AuthProvider, useAuth } from '../AuthContext';
import { saveTokens } from '../../platform/tokenStore';

function makeJwt(payload: Record<string, unknown>): string {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url({ alg: 'RS256' })}.${b64url(payload)}.signature`;
}

function tokenExpiringIn(seconds: number): string {
  return makeJwt({ sub: 'u1', exp: Math.floor((Date.now() + seconds * 1000) / 1000) });
}

function Probe() {
  const { isLoggedIn } = useAuth();
  return <span data-testid="state">{isLoggedIn ? 'in' : 'out'}</span>;
}

function renderProbe() {
  render(<AuthProvider><Probe /></AuthProvider>);
  return screen.getByTestId('state').textContent;
}

describe('AuthContext (Issue #36)', () => {
  beforeEach(() => {
    localStorage.clear();
    refreshMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('失効済み + refresh token なし: ゲストに落とし、localStorageも空にする', () => {
    saveTokens(tokenExpiringIn(-10));
    expect(renderProbe()).toBe('out');
    expect(localStorage.getItem('fcms_token')).toBeNull();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('失効済み + refresh token あり: refreshを起動し、ログイン中として扱う', () => {
    saveTokens(tokenExpiringIn(-10), 'rt-1');
    expect(renderProbe()).toBe('in');
    expect(refreshMock).toHaveBeenCalled();
    expect(localStorage.getItem('fcms_token')).not.toBeNull();
  });

  it('有効なトークン: refreshせずログイン中', () => {
    saveTokens(tokenExpiringIn(900), 'rt-1');
    expect(renderProbe()).toBe('in');
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('トークン無し: ゲスト', () => {
    expect(renderProbe()).toBe('out');
  });

  it('失効60秒前に自動refreshする', () => {
    vi.useFakeTimers();
    saveTokens(tokenExpiringIn(900), 'rt-1');
    render(<AuthProvider><Probe /></AuthProvider>);
    expect(refreshMock).not.toHaveBeenCalled();

    // 900秒 - 60秒 の直前では発火せず、超えると発火する
    vi.advanceTimersByTime(839_000);
    expect(refreshMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(refreshMock).toHaveBeenCalled();
  });

  it('expが取れないトークンでは自動refreshタイマーを張らない', () => {
    vi.useFakeTimers();
    saveTokens(makeJwt({ sub: 'u1' }), 'rt-1');
    render(<AuthProvider><Probe /></AuthProvider>);
    vi.advanceTimersByTime(3_600_000);
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
