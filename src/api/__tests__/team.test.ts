import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import team from '../team';
import type { Env } from '../../worker';

interface FakeTeam {
  id: string;
  user_id: string;
  name: string;
  field_pieces: string;
  bench_pieces: string;
  slot_number: number;
  is_active: number;
  formation_preset: string;
  created_at: string;
  updated_at: string;
}

interface FakeState {
  teams: FakeTeam[];
  owned: Set<number>;
}

function makeFieldPieces() {
  return Array.from({ length: 11 }, (_, i) => ({
    piece_id: i + 1,
    position: i === 0 ? 'GK' : 'DF',
    cost: 1,
  }));
}

function makeDb(state: FakeState) {
  const db = {
    prepare(sql: string) {
      const stmt = {
        args: [] as unknown[],
        bind(...args: unknown[]) {
          this.args = args;
          return this;
        },
        async all<T>(): Promise<{ results: T[] }> {
          if (sql.includes('FROM teams')) {
            const userId = String(this.args[0]);
            return { results: state.teams.filter((t) => t.user_id === userId) as T[] };
          }
          if (sql.includes('FROM user_pieces_v2')) {
            return { results: [...state.owned].map((piece_id) => ({ piece_id })) as T[] };
          }
          return { results: [] };
        },
        async first<T>(): Promise<T | null> {
          if (sql.includes('WHERE user_id = ? AND slot_number = ?')) {
            const userId = String(this.args[0]);
            const slot = Number(this.args[1]);
            const found = state.teams.find((t) => t.user_id === userId && t.slot_number === slot);
            return found ? ({ id: found.id } as T) : null;
          }
          if (sql.includes('WHERE id = ? AND user_id = ?')) {
            const teamId = String(this.args[0]);
            const userId = String(this.args[1]);
            return (state.teams.find((t) => t.id === teamId && t.user_id === userId) as T | undefined) ?? null;
          }
          return null;
        },
        async run(): Promise<{ meta: { changes: number } }> {
          if (sql.includes('INSERT INTO teams')) {
            const [
              id,
              user_id,
              name,
              slot_number,
              formation_preset,
              field_pieces,
              bench_pieces,
              created_at,
              updated_at,
            ] = this.args;
            state.teams.push({
              id: String(id),
              user_id: String(user_id),
              name: String(name),
              slot_number: Number(slot_number),
              formation_preset: String(formation_preset),
              field_pieces: String(field_pieces),
              bench_pieces: String(bench_pieces),
              created_at: String(created_at),
              updated_at: String(updated_at),
              is_active: 0,
            });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 1 } };
        },
      };
      return stmt;
    },
    batch: async () => [],
  };
  return db as unknown as D1Database;
}

function makeApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env['Bindings']; Variables: { userId: string } }>();
  app.use('*', async (c, next) => {
    c.set('userId', 'u1');
    await next();
  });
  app.route('/', team);
  return app;
}

function env(db: D1Database): Env['Bindings'] {
  return {
    DB: db,
    PLATFORM_API_BASE: 'https://platform.example.test',
    PLATFORM_GAME_ID: 'football_chess_maniacs',
    PLATFORM_SAVE_SLOT_SKU: 'fcms_save_slots_9',
    PLATFORM_SUBSCRIPTION_SKU: 'uf_subscription_monthly_premium',
    SUBSCRIPTION_SAVE_SLOT_BONUS: '3',
  } as unknown as Env['Bindings'];
}

function stubEntitlementCheck(allowedSkus: Set<string>) {
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { sku?: string };
    return new Response(JSON.stringify({ allowed: body.sku ? allowedSkus.has(body.sku) : false }), { status: 200 });
  }));
}

describe('team save slot entitlements', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('global subscription unlocks base slot + configured bonus slots', async () => {
    const state: FakeState = { teams: [], owned: new Set() };
    const db = makeDb(state);
    const app = makeApp(db);
    stubEntitlementCheck(new Set(['uf_subscription_monthly_premium']));

    const res = await app.request('/', {
      headers: { Authorization: 'Bearer user-token' },
    }, env(db));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      max_slots: 10,
      available_slots: 4,
      subscription_active: true,
      save_slot_entitlement_active: false,
      subscription_extra_slots: 3,
    });
  });

  it('allows new saves inside subscription bonus slots and rejects higher slots', async () => {
    const state: FakeState = {
      teams: [],
      owned: new Set(Array.from({ length: 20 }, (_, i) => i + 1)),
    };
    const db = makeDb(state);
    const app = makeApp(db);
    stubEntitlementCheck(new Set(['uf_subscription_monthly_premium']));

    const ok = await app.request('/', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Slot 4', slot_number: 4, fieldPieces: makeFieldPieces(), benchPieces: [] }),
    }, env(db));
    expect(ok.status).toBe(201);

    const locked = await app.request('/', {
      method: 'POST',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Slot 5', slot_number: 5, fieldPieces: makeFieldPieces(), benchPieces: [] }),
    }, env(db));
    expect(locked.status).toBe(403);
    await expect(locked.json()).resolves.toMatchObject({ error: 'PREMIUM_REQUIRED', available_slots: 4 });
  });

  it('keeps expired subscription slots readable but blocks overwrite', async () => {
    const state: FakeState = {
      teams: [{
        id: 'team-locked',
        user_id: 'u1',
        name: 'Locked',
        field_pieces: '[]',
        bench_pieces: '[]',
        slot_number: 4,
        is_active: 0,
        formation_preset: '4-4-2',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      }],
      owned: new Set(Array.from({ length: 20 }, (_, i) => i + 1)),
    };
    const db = makeDb(state);
    const app = makeApp(db);
    stubEntitlementCheck(new Set());

    const list = await app.request('/', {
      headers: { Authorization: 'Bearer user-token' },
    }, env(db));
    expect(list.status).toBe(200);
    const listBody = await list.json() as { teams: unknown[]; available_slots: number };
    expect(listBody.available_slots).toBe(1);
    expect(listBody.teams).toHaveLength(1);

    const update = await app.request('/team-locked', {
      method: 'PUT',
      headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Overwrite' }),
    }, env(db));
    expect(update.status).toBe(403);
    await expect(update.json()).resolves.toMatchObject({ error: 'PREMIUM_REQUIRED', available_slots: 1 });
  });
});
