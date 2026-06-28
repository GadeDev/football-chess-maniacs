// ============================================================
// shop.test.ts — ショップ購入のマネー経路（POST /api/shop/purchase）
//   ガード付き減算・二重購入防止・残高不足・付与をフェイクD1で検証。
// ============================================================

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import shop from '../shop';

// ── フェイク D1 ───────────────────────────────────────────
interface FakeState {
  pieceMaster: Record<number, { cost: number; is_purchasable: number }>;
  owned: Set<string>; // `${userId}:${pieceId}`
  wallets: Record<string, number>; // userId → ingots
}

function makeFakeDb(state: FakeState) {
  const stmt = (sql: string) => ({
    _args: [] as unknown[],
    bind(...args: unknown[]) { this._args = args; return this; },
    async first<T>(): Promise<T | null> {
      if (sql.includes('FROM piece_master')) {
        const pid = this._args[0] as number;
        const p = state.pieceMaster[pid];
        return p ? ({ piece_id: pid, cost: p.cost, is_purchasable: p.is_purchasable } as T) : null;
      }
      if (sql.includes('SELECT 1 FROM user_pieces_v2')) {
        const [uid, pid] = this._args as [string, number];
        return state.owned.has(`${uid}:${pid}`) ? ({ 1: 1 } as T) : null;
      }
      if (sql.includes('SELECT ingots FROM user_wallets')) {
        const uid = this._args[0] as string;
        return ({ ingots: state.wallets[uid] ?? 0 } as T);
      }
      return null;
    },
    async run(): Promise<{ meta: { changes: number } }> {
      // ガード付き減算: UPDATE ... ingots = ingots - ? ... WHERE user_id=? AND ingots>=?
      if (sql.includes('UPDATE user_wallets') && sql.includes('ingots = ingots - ?')) {
        const [price, , uid, min] = this._args as [number, string, string, number];
        const bal = state.wallets[uid] ?? 0;
        if (bal >= (min as number)) {
          state.wallets[uid] = bal - (price as number);
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      }
      // 返金: ingots = ingots + ?
      if (sql.includes('UPDATE user_wallets') && sql.includes('ingots = ingots + ?')) {
        const [amount, , uid] = this._args as [number, string, string];
        state.wallets[uid] = (state.wallets[uid] ?? 0) + (amount as number);
        return { meta: { changes: 1 } };
      }
      // コマ付与
      if (sql.includes('INSERT') && sql.includes('user_pieces_v2')) {
        const [uid, pid] = this._args as [string, number];
        state.owned.add(`${uid}:${pid}`);
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    },
  });
  return { prepare: (sql: string) => stmt(sql) } as unknown as D1Database;
}

// userId を注入して shop をマウントしたテスト用アプリ
function makeApp(userId: string | null, db: D1Database) {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use('*', async (c, next) => { if (userId) c.set('userId', userId); await next(); });
  app.route('/', shop);
  const fakeKv = { delete: async () => {}, get: async () => null, put: async () => {} };
  const env = { DB: db, KV: fakeKv } as unknown as Parameters<typeof app.request>[2];
  return { app, env };
}

function purchase(app: Hono<{ Variables: { userId: string } }>, env: unknown, pieceId: unknown) {
  return app.request('/purchase', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ piece_id: pieceId }),
  }, env as Parameters<typeof app.request>[2]);
}

describe('POST /api/shop/purchase', () => {
  it('残高十分 → 201・残高がprice分減算・コマ付与', async () => {
    const state: FakeState = {
      pieceMaster: { 5: { cost: 2, is_purchasable: 1 } },
      owned: new Set(),
      wallets: { u1: 10 },
    };
    const { app, env } = makeApp('u1', makeFakeDb(state));
    const res = await purchase(app, env, 5);
    expect(res.status).toBe(201);
    expect(state.wallets.u1).toBe(8); // cost2 → price2
    expect(state.owned.has('u1:5')).toBe(true);
  });

  it('残高不足 → 402・減算なし・未付与', async () => {
    const state: FakeState = {
      pieceMaster: { 5: { cost: 3, is_purchasable: 1 } },
      owned: new Set(),
      wallets: { u1: 1 }, // price3 に足りない
    };
    const { app, env } = makeApp('u1', makeFakeDb(state));
    const res = await purchase(app, env, 5);
    expect(res.status).toBe(402);
    expect(state.wallets.u1).toBe(1); // 減算されない
    expect(state.owned.has('u1:5')).toBe(false);
  });

  it('所持済み → 409・減算なし', async () => {
    const state: FakeState = {
      pieceMaster: { 5: { cost: 2, is_purchasable: 1 } },
      owned: new Set(['u1:5']),
      wallets: { u1: 10 },
    };
    const { app, env } = makeApp('u1', makeFakeDb(state));
    const res = await purchase(app, env, 5);
    expect(res.status).toBe(409);
    expect(state.wallets.u1).toBe(10);
  });

  it('購入不可コマ → 400', async () => {
    const state: FakeState = {
      pieceMaster: { 7: { cost: 1, is_purchasable: 0 } },
      owned: new Set(),
      wallets: { u1: 10 },
    };
    const { app, env } = makeApp('u1', makeFakeDb(state));
    const res = await purchase(app, env, 7);
    expect(res.status).toBe(400);
    expect(state.wallets.u1).toBe(10);
  });

  it('存在しないpiece_id → 400', async () => {
    const state: FakeState = { pieceMaster: {}, owned: new Set(), wallets: { u1: 10 } };
    const { app, env } = makeApp('u1', makeFakeDb(state));
    const res = await purchase(app, env, 999);
    expect(res.status).toBe(400);
  });

  it('未認証(userIdなし) → 401', async () => {
    const state: FakeState = { pieceMaster: {}, owned: new Set(), wallets: {} };
    const { app, env } = makeApp(null, makeFakeDb(state));
    const res = await purchase(app, env, 5);
    expect(res.status).toBe(401);
  });

  it('piece_id 非整数 → 400', async () => {
    const state: FakeState = { pieceMaster: {}, owned: new Set(), wallets: { u1: 10 } };
    const { app, env } = makeApp('u1', makeFakeDb(state));
    const res = await purchase(app, env, 'abc');
    expect(res.status).toBe(400);
  });
});
