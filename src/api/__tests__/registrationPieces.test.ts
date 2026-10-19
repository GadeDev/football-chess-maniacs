import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import pieces from '../pieces';

// Execute the real route's SQL against SQLite, the same SQL dialect used by D1.
it('registered users receive aces without purchases, preserving user-specific ownership', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE piece_master (piece_id INTEGER PRIMARY KEY, sku TEXT, name_ja TEXT, name_en TEXT, position TEXT, cost REAL, era TEXT, era_shelf INTEGER, family TEXT, nationality TEXT, is_founding INTEGER, summary_ja TEXT, image_url TEXT, image_status TEXT);
    CREATE TABLE user_pieces_v2 (user_id TEXT, piece_id INTEGER, source TEXT, entitlement_id TEXT, acquired_at TEXT);
    INSERT INTO piece_master(piece_id,cost) VALUES (1,1),(29,2.5),(40,3),(2,1.5);
    INSERT INTO user_pieces_v2 VALUES ('u1',1,'purchase','past-purchase','2026-01-01'),('u2',2,'purchase','other-user','2026-01-01');`);
  const db = { prepare(sql: string) {
    const statement = sqlite.prepare(sql); let args: any[] = [];
    return { bind(...values: any[]) { args = values; return this; }, async all() { return { results: statement.all(...args) }; }, async first() { return statement.get(...args); } };
  } };
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use('*', async (c, next) => { c.set('userId', 'u1'); await next(); });
  app.route('/', pieces);
  try {
    const res = await app.request('/', {}, { DB: db });
    expect(res.status).toBe(200);
    const body = await res.json() as { items: { piece_id: number; source: string }[] };
    expect(body.items.map(p => p.piece_id)).toEqual([1,29,40]);
    expect(body.items[0].source).toBe('purchase');
    expect(body.items[1].source).toBe('registration');
    const count = await app.request('/count', {}, { DB: db });
    expect(await count.json()).toEqual({ count: 3, max: 200 });
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM user_pieces_v2').get()?.n).toBe(2);
  } finally { sqlite.close(); }
});
