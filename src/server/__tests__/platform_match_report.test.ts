// ============================================================
// platform_match_report.test.ts — matches/finish 送信ペイロード組み立て + 送信経路
// ============================================================

import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  buildMatchFinishPayload,
  resolveMatchMode,
  resolveWinnerSide,
  sendMatchFinishReport,
  type MatchFinishSourceData,
} from '../platform_match_report';
import type { Env } from '../../worker';

const BASE: MatchFinishSourceData = {
  matchId: 'match-abc',
  homeUserId: '11111111-1111-1111-1111-111111111111',
  awayUserId: '22222222-2222-2222-2222-222222222222',
  scoreHome: 2,
  scoreAway: 1,
  reason: 'completed',
  turnLog: [],
  matchCreatedAtIso: '2026-07-07T10:00:00.000Z',
  finishedAtIso: '2026-07-07T10:30:00.000Z',
};

describe('resolveMatchMode', () => {
  it.each([
    ['friend_abc', 'friend'],
    ['casual_abc', 'casual'],
    ['com_abc', 'com'],
    ['gemma_com_abc', 'com'],
    ['abc123', 'ranked'],
  ] as const)('%s → %s', (matchId, expected) => {
    expect(resolveMatchMode(matchId)).toBe(expected);
  });
});

describe('resolveWinnerSide', () => {
  it('スコア差で勝敗を判定', () => {
    expect(resolveWinnerSide(2, 1, 'completed', undefined)).toBe('home');
    expect(resolveWinnerSide(1, 2, 'completed', undefined)).toBe('away');
    expect(resolveWinnerSide(1, 1, 'completed', undefined)).toBeNull();
  });

  it('disconnectはdisconnectLoserの逆側が勝ち', () => {
    expect(resolveWinnerSide(0, 0, 'disconnect', 'home')).toBe('away');
    expect(resolveWinnerSide(0, 0, 'disconnect', 'away')).toBe('home');
  });
});

describe('buildMatchFinishPayload', () => {
  it('ランクマッチ: 両者human、winner_side/score/durationを算出', () => {
    const payload = buildMatchFinishPayload(BASE);
    expect(payload.mode).toBe('ranked');
    expect(payload.external_match_id).toBe('match-abc');
    expect(payload.winner_side).toBe('home');
    expect(payload.score).toEqual({ home: 2, away: 1 });
    expect(payload.duration_sec).toBe(1800);
    expect(payload.participants).toHaveLength(2);
    const home = payload.participants.find(p => p.side === 'home')!;
    const away = payload.participants.find(p => p.side === 'away')!;
    expect(home.user_id).toBe(BASE.homeUserId);
    expect(home.guest_session_id).toBeNull();
    expect(home.stats.opponent_type).toBe('human');
    expect(home.stats.flags.won).toBe(true);
    expect(away.stats.flags.won).toBe(false);
    expect(home.stats.counts.duration_sec).toBe(1800);
    expect(away.stats.counts.duration_sec).toBe(1800);
  });

  it('COM対戦: awayが"com_ai"ならCOM側を除外しopponent_type=cpu', () => {
    const data: MatchFinishSourceData = {
      ...BASE,
      matchId: 'gemma_com_123',
      homeUserId: 'com_player_abcdef',
      awayUserId: 'com_ai',
    };
    const payload = buildMatchFinishPayload(data);
    expect(payload.mode).toBe('com');
    expect(payload.participants).toHaveLength(1);
    const p = payload.participants[0];
    expect(p.side).toBe('home');
    expect(p.stats.opponent_type).toBe('cpu');
    expect(p.user_id).toBeNull();
    expect(p.guest_session_id).toBe('com_player_abcdef');
  });

  it('フレンド対戦: friend_ prefixでmode=friend、両者human', () => {
    const data: MatchFinishSourceData = { ...BASE, matchId: 'friend_xyz' };
    const payload = buildMatchFinishPayload(data);
    expect(payload.mode).toBe('friend');
    expect(payload.participants).toHaveLength(2);
    expect(payload.participants.every(p => p.stats.opponent_type === 'human')).toBe(true);
  });

  it('disconnect: disconnect_lossフラグが敗者側に立つ', () => {
    const data: MatchFinishSourceData = {
      ...BASE, reason: 'disconnect', disconnectLoser: 'away', scoreHome: 1, scoreAway: 1,
    };
    const payload = buildMatchFinishPayload(data);
    const away = payload.participants.find(p => p.side === 'away')!;
    const home = payload.participants.find(p => p.side === 'home')!;
    expect(payload.winner_side).toBe('home');
    expect(away.stats.flags.disconnect_loss).toBe(true);
    expect(home.stats.flags.disconnect_loss).toBe(false);
  });
});

describe('sendMatchFinishReport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function makeEnv(overrides: Partial<Env['Bindings']> = {}): Env['Bindings'] {
    return {
      PLATFORM_API_BASE: 'https://platform.example.test',
      PLATFORM_GAME_ID: 'football_chess_maniacs',
      PLATFORM_GAME_SERVER_TOKEN: 'gfp_test_token',
      ...overrides,
    } as unknown as Env['Bindings'];
  }

  it('トークン未設定なら送信をスキップする（例外を投げない）', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(sendMatchFinishReport(makeEnv({ PLATFORM_GAME_SERVER_TOKEN: undefined as unknown as string }), BASE))
      .resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('正常系: /v1/game/matches/finish をgame server token付きで呼ぶ', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init;
      expect(String(input)).toContain('/v1/game/matches/finish');
      return new Response(JSON.stringify({ match_result_id: 'r1', game_id: 'football_chess_maniacs', external_match_id: BASE.matchId, status: 'completed' }), { status: 201 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await sendMatchFinishReport(makeEnv(), BASE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(capturedInit?.method).toBe('POST');
    const headers = new Headers(capturedInit?.headers);
    expect(headers.get('Authorization')).toBe('Bearer gfp_test_token');
    const body = JSON.parse(String(capturedInit?.body));
    expect(body.external_match_id).toBe(BASE.matchId);
  });

  it('Platform障害時は例外を投げず握りつぶす', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 503 })));
    await expect(sendMatchFinishReport(makeEnv(), BASE)).resolves.toBeUndefined();
  });

  it('ネットワークエラー時も例外を投げない', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    await expect(sendMatchFinishReport(makeEnv(), BASE)).resolves.toBeUndefined();
  });
});
