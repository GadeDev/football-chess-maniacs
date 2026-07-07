// ============================================================
// match_com_report.test.ts — POST /match/com-report のバリデーションと
// Platform finish送信ペイロードの検証（クライアントCOM対戦の戦績報告）
// ============================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import match from '../match';
import type { Env } from '../../worker';

function makeApp() {
  const app = new Hono<{ Bindings: Env['Bindings']; Variables: { userId: string } }>();
  app.use('*', async (c, next) => {
    c.set('userId', 'user-1');
    await next();
  });
  app.route('/', match);
  return app;
}

function env(overrides: Record<string, unknown> = {}): Env['Bindings'] {
  return {
    PLATFORM_API_BASE: 'https://platform.example.test',
    PLATFORM_GAME_ID: 'football_chess_maniacs',
    ...overrides,
  } as unknown as Env['Bindings'];
}

function validBody() {
  const started = Date.now() - 10 * 60 * 1000;
  return {
    matchId: `com_${started}`,
    scoreHome: 2,
    scoreAway: 1,
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    turnLog: Array.from({ length: 32 }, (_, i) => ({
      turn: i + 1,
      inputs: {
        'user-1': { player_id: 'user-1', nonce: `client_${i + 1}`, timestamp: started + i * 8000, orders: [] },
      },
      events: [{ type: 'PIECE_MOVED', pieceId: 'h05' }],
      goalScoredBy: i === 10 ? ('home' as const) : null,
      timestamp: started + i * 8000 + 500,
    })),
  };
}

function post(app: ReturnType<typeof makeApp>, body: unknown, bindings = env()) {
  return app.request('/com-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }, bindings);
}

describe('POST /match/com-report', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('有効なレポートは202（トークン未設定時は送信スキップでもレスポンスは変わらない）', async () => {
    const app = makeApp();
    const res = await post(app, validBody());
    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it('matchIdがcom_プレフィックス+タイムスタンプ形式でなければ400', async () => {
    const app = makeApp();
    for (const bad of ['gemma_com_123', 'casual_x', 'com_abc', `com_${'9'.repeat(30)}`]) {
      const res = await post(app, { ...validBody(), matchId: bad });
      expect(res.status, bad).toBe(400);
    }
  });

  it('スコア/タイムスタンプ/turnLogの不正は400', async () => {
    const app = makeApp();
    expect((await post(app, { ...validBody(), scoreHome: -1 })).status).toBe(400);
    expect((await post(app, { ...validBody(), scoreAway: 1.5 })).status).toBe(400);
    expect((await post(app, { ...validBody(), startedAt: 'not-a-date' })).status).toBe(400);
    expect((await post(app, { ...validBody(), turnLog: [] })).status).toBe(400);
    const tooMany = { ...validBody(), turnLog: Array.from({ length: 61 }, (_, i) => validBody().turnLog[0] && { ...validBody().turnLog[0], turn: i + 1 }) };
    expect((await post(app, tooMany)).status).toBe(400);
    // 終了が開始より前
    const inverted = { ...validBody(), finishedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() };
    expect((await post(app, inverted)).status).toBe(400);
  });

  it('512KB超のボディは413', async () => {
    const app = makeApp();
    const res = await post(app, '{"pad":"' + 'x'.repeat(520 * 1024) + '"}');
    expect(res.status).toBe(413);
  });

  it('トークン設定時はPlatformへ mode=com・人間1名参加でfinishが送信される', async () => {
    const app = makeApp();
    const captured: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      captured.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));

    const body = validBody();
    const res = await post(app, body, env({ PLATFORM_GAME_SERVER_TOKEN: 'gfp_test' }));
    expect(res.status).toBe(202);
    expect(captured).toHaveLength(1);
    expect(captured[0].url).toContain('/v1/game/matches/finish');
    const payload = captured[0].body as {
      external_match_id: string; mode: string; score: { home: number; away: number };
      participants: Array<{ user_id: string | null; side: string; opponent_type: string }>;
    };
    expect(payload.external_match_id).toBe(body.matchId);
    expect(payload.mode).toBe('com');
    expect(payload.score).toEqual({ home: 2, away: 1 });
    expect(payload.participants).toHaveLength(1);
    expect(payload.participants[0].user_id).toBe('user-1');
  });
});
