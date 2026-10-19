import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { MATCH_LINEUP_PREFIX, readMatchLineup } from '../matchLineup';

it('uses a registered ace in a match without saving and rejects forged or unowned pieces', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE piece_master (piece_id INTEGER, position TEXT, cost REAL); CREATE TABLE user_pieces_v2 (user_id TEXT, piece_id INTEGER);');
  for (let id = 1; id <= 12; id++) {
    sqlite.prepare('INSERT INTO piece_master VALUES (?, ?, ?)').run(id, id === 1 ? 'GK' : 'DF', id === 11 ? 2.5 : 1);
    if (id <= 10) sqlite.prepare('INSERT INTO user_pieces_v2 VALUES (?, ?)').run('free-user', id);
  }
  const db = { prepare(sql: string) { const stmt = sqlite.prepare(sql); let args: any[] = []; return { bind(...v: any[]) { args = v; return this; }, async all() { return { results: stmt.all(...args) }; } }; } } as unknown as D1Database;
  const starters = Array.from({ length: 11 }, (_, i) => ({ pieceId: i + 1, col: i, row: 3, cost: 0, position: 'FW' }));
  const encode = (field = starters) => MATCH_LINEUP_PREFIX + JSON.stringify({ starters: field, bench: [] });
  try {
    const result = await readMatchLineup(db, 'free-user', encode());
    expect(result?.field[10].cost).toBe(2.5);
    expect(result?.field[0].position).toBe('GK');
    expect(result?.field).toHaveLength(11);
    expect(await readMatchLineup(db, 'other-user', encode())).toBeNull();
    expect(await readMatchLineup(db, 'free-user', encode(starters.map((p, i) => i === 10 ? { ...p, pieceId: 12 } : p)))).toBeNull();
    expect(await readMatchLineup(db, 'free-user', encode(starters.map(p => ({ ...p, col: 0 }))))).toBeNull();
    expect(sqlite.prepare('SELECT COUNT(*) n FROM user_pieces_v2').get()?.n).toBe(10);
  } finally { sqlite.close(); }
});
