// ============================================================
// match_friend.test.ts — フレンド対戦API（/match/friend/create, /status/:roomId, /join）
// ============================================================

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import match from '../match';

function makeFakeKv() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); },
  };
}

function makeFakeDb() {
  const inserted: unknown[] = [];
  return {
    inserted,
    prepare: (sql: string) => ({
      _args: [] as unknown[],
      bind(...args: unknown[]) { this._args = args; return this; },
      async run() {
        if (sql.includes('INSERT INTO matches')) inserted.push(this._args);
        return { meta: { changes: 1 } };
      },
      async first() { return null; },
    }),
  };
}

function makeFakeGameSession() {
  const initCalls: unknown[] = [];
  return {
    initCalls,
    idFromName: (name: string) => name,
    get: () => ({
      fetch: async (req: Request) => {
        const body = await req.json();
        initCalls.push(body);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    }),
  };
}

function makeApp(userId: string, kv: ReturnType<typeof makeFakeKv>, db: ReturnType<typeof makeFakeDb>, gameSession: ReturnType<typeof makeFakeGameSession>) {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use('*', async (c, next) => { c.set('userId', userId); await next(); });
  app.route('/', match);
  const env = { KV: kv, DB: db, GAME_SESSION: gameSession } as unknown as Parameters<typeof app.request>[2];
  return { app, env };
}

describe('POST /friend/create', () => {
  it('6桁のルームIDを発行してKVに保存する', async () => {
    const kv = makeFakeKv();
    const { app, env } = makeApp('host1', kv, makeFakeDb(), makeFakeGameSession());
    const res = await app.request('/friend/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: 'team-a' }),
    }, env);
    expect(res.status).toBe(200);
    const data = await res.json() as { roomId: string; expiresInSec: number };
    expect(data.roomId).toMatch(/^[A-Z0-9]{6}$/);
    const stored = JSON.parse(kv.store.get(`friend_room:${data.roomId}`)!);
    expect(stored.hostUserId).toBe('host1');
    expect(stored.hostTeamId).toBe('team-a');
  });
});

describe('GET /friend/status/:roomId', () => {
  it('未参加の場合はmatched:falseを返す', async () => {
    const kv = makeFakeKv();
    await kv.put('friend_room:ABC123', JSON.stringify({ hostUserId: 'host1', hostTeamId: 'default', createdAt: Date.now() }));
    const { app, env } = makeApp('host1', kv, makeFakeDb(), makeFakeGameSession());
    const res = await app.request('/friend/status/ABC123', {}, env);
    const data = await res.json() as { matched: boolean };
    expect(data.matched).toBe(false);
  });

  it('ホスト以外がアクセスすると403', async () => {
    const kv = makeFakeKv();
    await kv.put('friend_room:ABC123', JSON.stringify({ hostUserId: 'host1', hostTeamId: 'default', createdAt: Date.now() }));
    const { app, env } = makeApp('otherUser', kv, makeFakeDb(), makeFakeGameSession());
    const res = await app.request('/friend/status/ABC123', {}, env);
    expect(res.status).toBe(403);
  });

  it('参加成立後はmatched:trueを返しルームを消費する', async () => {
    const kv = makeFakeKv();
    await kv.put('friend_room:ABC123', JSON.stringify({ hostUserId: 'host1', hostTeamId: 'default', matchId: 'friend_xyz', createdAt: Date.now() }));
    const { app, env } = makeApp('host1', kv, makeFakeDb(), makeFakeGameSession());
    const res = await app.request('/friend/status/ABC123', {}, env);
    const data = await res.json() as { matched: boolean; matchId?: string; team?: string };
    expect(data.matched).toBe(true);
    expect(data.matchId).toBe('friend_xyz');
    expect(data.team).toBe('home');
    expect(kv.store.has('friend_room:ABC123')).toBe(false);
  });
});

describe('POST /friend/join', () => {
  it('有効なルームに参加するとGameSession DOを作成しmatchIdを返す', async () => {
    const kv = makeFakeKv();
    await kv.put('friend_room:ABC123', JSON.stringify({ hostUserId: 'host1', hostTeamId: 'team-a', createdAt: Date.now() }));
    const db = makeFakeDb();
    const gameSession = makeFakeGameSession();
    const { app, env } = makeApp('joiner1', kv, db, gameSession);
    const res = await app.request('/friend/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: 'abc123', teamId: 'team-b' }),
    }, env);
    expect(res.status).toBe(200);
    const data = await res.json() as { matchId: string; team: string };
    expect(data.matchId).toMatch(/^friend_/);
    expect(data.team).toBe('away');
    expect(gameSession.initCalls).toHaveLength(1);
    expect(db.inserted).toHaveLength(1);
  });

  it('存在しないルームは404 ROOM_NOT_FOUND', async () => {
    const kv = makeFakeKv();
    const { app, env } = makeApp('joiner1', kv, makeFakeDb(), makeFakeGameSession());
    const res = await app.request('/friend/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: 'ZZZZZZ' }),
    }, env);
    expect(res.status).toBe(404);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('ROOM_NOT_FOUND');
  });

  it('自分のルームには参加できない(400 CANNOT_JOIN_OWN_ROOM)', async () => {
    const kv = makeFakeKv();
    await kv.put('friend_room:ABC123', JSON.stringify({ hostUserId: 'host1', hostTeamId: 'default', createdAt: Date.now() }));
    const { app, env } = makeApp('host1', kv, makeFakeDb(), makeFakeGameSession());
    const res = await app.request('/friend/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: 'ABC123' }),
    }, env);
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('CANNOT_JOIN_OWN_ROOM');
  });

  it('すでに使用済みのルームは409 ROOM_ALREADY_USED', async () => {
    const kv = makeFakeKv();
    await kv.put('friend_room:ABC123', JSON.stringify({ hostUserId: 'host1', hostTeamId: 'default', matchId: 'friend_already', createdAt: Date.now() }));
    const { app, env } = makeApp('joiner1', kv, makeFakeDb(), makeFakeGameSession());
    const res = await app.request('/friend/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: 'ABC123' }),
    }, env);
    expect(res.status).toBe(409);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('ROOM_ALREADY_USED');
  });

  it('不正な形式のルームIDは400 INVALID_ROOM_ID', async () => {
    const kv = makeFakeKv();
    const { app, env } = makeApp('joiner1', kv, makeFakeDb(), makeFakeGameSession());
    const res = await app.request('/friend/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: 'abc' }),
    }, env);
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toBe('INVALID_ROOM_ID');
  });
});
