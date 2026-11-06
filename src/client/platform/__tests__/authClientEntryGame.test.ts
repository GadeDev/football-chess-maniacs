// @vitest-environment jsdom
// KPI-01：新規登録のときに、どの作品から入会したかの印（entry_game）を Platform へ送る。ログインには付けない。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { register, loginWithGoogle, login } from '../authClient';

function bodyOf(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return JSON.parse(String(init.body));
}

describe('KPI-01 entry_game', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('email sign-up sends football_chess_maniacs', async () => {
    await register('a@example.invalid', 'password123');
    expect(bodyOf(fetchMock)).toEqual({ email: 'a@example.invalid', password: 'password123', entry_game: 'football_chess_maniacs' });
  });

  it('Google sign-in sends it with and without a locale', async () => {
    await loginWithGoogle('tok', 'ja-JP');
    expect(bodyOf(fetchMock)).toEqual({ id_token: 'tok', locale: 'ja-JP', entry_game: 'football_chess_maniacs' });
    fetchMock.mockClear();
    await loginWithGoogle('tok');
    expect(bodyOf(fetchMock)).toEqual({ id_token: 'tok', entry_game: 'football_chess_maniacs' });
  });

  it('plain email login does not send it', async () => {
    await login('a@example.invalid', 'password123');
    expect(bodyOf(fetchMock)).toEqual({ email: 'a@example.invalid', password: 'password123' });
  });
});
