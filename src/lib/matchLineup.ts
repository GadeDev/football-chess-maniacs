import type { FormationFieldPiece, BenchFieldPiece } from '../durable/game_session_helpers';

export const MATCH_LINEUP_PREFIX = 'match-lineup:';

/** A match snapshot is validated server-side and never occupies a saved formation slot. */
export async function readMatchLineup(db: D1Database, userId: string, value: string): Promise<{ field: FormationFieldPiece[]; bench: BenchFieldPiece[] } | null> {
  if (!value.startsWith(MATCH_LINEUP_PREFIX) || value.length > 8192) return null;
  let draft: { starters?: Array<{ pieceId: number; col: number; row: number }>; bench?: Array<{ pieceId: number }> };
  try { draft = JSON.parse(value.slice(MATCH_LINEUP_PREFIX.length)); } catch { return null; }
  if (!draft || !Array.isArray(draft.starters) || draft.starters.length !== 11 || !Array.isArray(draft.bench) || draft.bench.length > 9) return null;
  const all = [...draft.starters, ...draft.bench];
  if (all.some(p => !p || !Number.isInteger(p.pieceId))) return null;
  const ids = all.map(p => p.pieceId);
  if (new Set(ids).size !== ids.length) return null;
  if (draft.starters.some(p => !Number.isInteger(p.col) || !Number.isInteger(p.row) || p.col < 0 || p.col > 21 || p.row < 0 || p.row > 33)) return null;
  if (new Set(draft.starters.map(p => `${p.col},${p.row}`)).size !== 11) return null;
  const rows = await db.prepare(`SELECT p.piece_id, p.position, p.cost FROM piece_master p
    LEFT JOIN user_pieces_v2 u ON u.piece_id = p.piece_id AND u.user_id = ?
    WHERE p.piece_id IN (${ids.map(() => '?').join(',')}) AND (u.piece_id IS NOT NULL OR p.cost >= 2.5)`)
    .bind(userId, ...ids).all<{ piece_id: number; position: FormationFieldPiece['position']; cost: FormationFieldPiece['cost'] }>();
  const master = new Map(rows.results.map(p => [p.piece_id, p]));
  if (ids.some(id => !master.has(id))) return null;
  const field = draft.starters.map(p => ({ ...master.get(p.pieceId)!, col: p.col, row: p.row }));
  if (field.filter(p => p.position === 'GK').length !== 1 || field.reduce((sum, p) => sum + p.cost, 0) > 16) return null;
  return { field, bench: draft.bench.map(p => master.get(p.pieceId)!) };
}
