// ============================================================
// team.ts — チーム編成API（§5-1 D1）
// Platform連携版: slot_number / is_active / ローカル所持確認
// ============================================================

import { Hono } from 'hono';
import type { Env } from '../worker';
import { callPlatformApi, getBearerToken } from './auth';

const team = new Hono<{ Bindings: Env['Bindings']; Variables: { userId: string } }>();

const BASE_SAVE_SLOTS = 1;
const MAX_SAVE_SLOTS = 10;
const DEFAULT_SAVE_SLOT_SKU = 'fcms_save_slots_9';
const DEFAULT_SUBSCRIPTION_SKU = 'uf_subscription_monthly_premium';
const DEFAULT_SUBSCRIPTION_BONUS_SLOTS = 3;

/** チーム編成レコード（v2: slot_number/is_active/formation_preset追加） */
interface TeamComposition {
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

interface FieldPiece {
  piece_id: number;
  position: string;
  cost: number;
}

/** フィールドコマのバリデーション（POST/PUT共通） */
function validateFieldPieces(fieldPieces: FieldPiece[]): string | null {
  if (fieldPieces.length !== 11) return 'Field must have exactly 11 pieces';
  const totalCost = fieldPieces.reduce((sum, p) => sum + p.cost, 0);
  if (totalCost > 16) return 'Field cost exceeds 16';
  const gkCount = fieldPieces.filter(p => p.position === 'GK').length;
  if (gkCount !== 1) return 'Field must have exactly 1 GK';
  // 重複チェック
  const pieceIds = fieldPieces.map(p => p.piece_id);
  if (new Set(pieceIds).size !== pieceIds.length) return 'Duplicate piece_id in field';
  return null;
}

/** ローカル D1 での所持コマ確認（Platform API不要） */
async function getLocalOwnedPieceIds(
  db: D1Database,
  userId: string,
): Promise<Set<number>> {
  const result = await db
    .prepare('SELECT piece_id FROM user_pieces_v2 WHERE user_id = ?')
    .bind(userId)
    .all<{ piece_id: number }>();
  return new Set(result.results.map((r) => r.piece_id));
}

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

function saveSlotSku(env: Env['Bindings']): string {
  return env.PLATFORM_SAVE_SLOT_SKU || DEFAULT_SAVE_SLOT_SKU;
}

function subscriptionSku(env: Env['Bindings']): string {
  return env.PLATFORM_SUBSCRIPTION_SKU || DEFAULT_SUBSCRIPTION_SKU;
}

function subscriptionBonusSlots(env: Env['Bindings']): number {
  return positiveInt(env.SUBSCRIPTION_SAVE_SLOT_BONUS, DEFAULT_SUBSCRIPTION_BONUS_SLOTS);
}

/** Platform Entitlement check。障害時はfalseに倒し、保存枠の新規書き込みを保守的に止める。 */
async function checkEntitlementSku(env: Env['Bindings'], userToken: string | null, sku: string): Promise<boolean> {
  if (!userToken || !sku) return false;
  try {
    const result = await callPlatformApi<{ allowed: boolean }>(
      env,
      '/v1/entitlements/check',
      {
        method: 'POST',
        authMode: 'user',
        userToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({ sku }),
      },
    );
    return result.allowed;
  } catch {
    return false;
  }
}

interface SaveSlotAccess {
  maxSlots: number;
  availableSlots: number;
  isPremium: boolean;
  saveSlotEntitlementActive: boolean;
  subscriptionActive: boolean;
  subscriptionExtraSlots: number;
}

async function getSaveSlotAccess(env: Env['Bindings'], userToken: string | null): Promise<SaveSlotAccess> {
  const [saveSlotEntitlementActive, subscriptionActive] = await Promise.all([
    checkEntitlementSku(env, userToken, saveSlotSku(env)),
    checkEntitlementSku(env, userToken, subscriptionSku(env)),
  ]);
  const subscriptionExtraSlots = subscriptionActive ? subscriptionBonusSlots(env) : 0;
  const availableSlots = saveSlotEntitlementActive
    ? MAX_SAVE_SLOTS
    : Math.min(MAX_SAVE_SLOTS, BASE_SAVE_SLOTS + subscriptionExtraSlots);

  return {
    maxSlots: MAX_SAVE_SLOTS,
    availableSlots,
    isPremium: availableSlots > BASE_SAVE_SLOTS,
    saveSlotEntitlementActive,
    subscriptionActive,
    subscriptionExtraSlots,
  };
}

// ── チーム一覧取得 ──
team.get('/', async (c) => {
  const userId = c.get('userId');
  const userToken = getBearerToken(c.req.header('Authorization'));

  const result = await c.env.DB.prepare(
    'SELECT id, name, slot_number, is_active, formation_preset, field_pieces, bench_pieces, updated_at FROM teams WHERE user_id = ? ORDER BY slot_number ASC',
  )
    .bind(userId)
    .all<TeamComposition>();

  const access = await getSaveSlotAccess(c.env, userToken);

  return c.json({
    teams: result.results.map((t) => {
      try {
        return {
          id: t.id,
          name: t.name,
          slot_number: t.slot_number ?? 1,
          is_active: !!(t.is_active),
          formation_preset: t.formation_preset ?? '4-4-2',
          fieldPieces: JSON.parse(t.field_pieces),
          benchPieces: JSON.parse(t.bench_pieces),
          updatedAt: t.updated_at,
        };
      } catch {
        return {
          id: t.id, name: t.name, slot_number: t.slot_number ?? 1,
          is_active: false, formation_preset: '4-4-2',
          fieldPieces: [], benchPieces: [], updatedAt: t.updated_at,
        };
      }
    }),
    max_slots: access.maxSlots,
    available_slots: access.availableSlots,
    is_premium: access.isPremium,
    save_slot_entitlement_active: access.saveSlotEntitlementActive,
    subscription_active: access.subscriptionActive,
    subscription_extra_slots: access.subscriptionExtraSlots,
  });
});

// ── チーム取得 ──
team.get('/:teamId', async (c) => {
  const userId = c.get('userId');
  const teamId = c.req.param('teamId');

  const result = await c.env.DB.prepare(
    'SELECT * FROM teams WHERE id = ? AND user_id = ?',
  )
    .bind(teamId, userId)
    .first<TeamComposition>();

  if (!result) {
    return c.json({ error: 'Team not found' }, 404);
  }

  try {
    return c.json({
      id: result.id,
      name: result.name,
      slot_number: result.slot_number ?? 1,
      is_active: !!(result.is_active),
      formation_preset: result.formation_preset ?? '4-4-2',
      fieldPieces: JSON.parse(result.field_pieces),
      benchPieces: JSON.parse(result.bench_pieces),
      updatedAt: result.updated_at,
    });
  } catch {
    return c.json({ error: 'Corrupted team data' }, 500);
  }
});

// ── チーム作成（slot_number指定） ──
team.post('/', async (c) => {
  const userId = c.get('userId');
  const userToken = getBearerToken(c.req.header('Authorization'));
  const body = await c.req.json<{
    name: string;
    slot_number?: number;
    formation_preset?: string;
    fieldPieces: FieldPiece[];
    benchPieces: FieldPiece[];
  }>();

  // バリデーション
  if (!body.name || body.name.length > 50) {
    return c.json({ error: 'Invalid team name' }, 400);
  }

  if (!body.fieldPieces) {
    return c.json({ error: 'Field must have exactly 11 pieces' }, 400);
  }
  const fieldError = validateFieldPieces(body.fieldPieces);
  if (fieldError) {
    return c.json({ error: fieldError }, 400);
  }

  // スロット番号の検証
  const slotNumber = body.slot_number ?? 1;
  if (slotNumber < 1 || slotNumber > MAX_SAVE_SLOTS || !Number.isInteger(slotNumber)) {
    return c.json({ error: 'VALIDATION_ERROR', message: `slot_number must be 1-${MAX_SAVE_SLOTS}` }, 400);
  }

  const access = await getSaveSlotAccess(c.env, userToken);
  if (slotNumber > access.availableSlots) {
    return c.json({
      error: 'PREMIUM_REQUIRED',
      message: `Slot ${slotNumber} is not available for new saves`,
      available_slots: access.availableSlots,
    }, 403);
  }

  // スロット重複チェック
  const existingSlot = await c.env.DB.prepare(
    'SELECT id FROM teams WHERE user_id = ? AND slot_number = ?',
  )
    .bind(userId, slotNumber)
    .first();

  if (existingSlot) {
    return c.json({ error: 'VALIDATION_ERROR', message: `Slot ${slotNumber} is already used` }, 409);
  }

  // 所持コマ検証（ローカルD1）
  const ownedIds = await getLocalOwnedPieceIds(c.env.DB, userId);
  const allPieceIds = [...body.fieldPieces, ...(body.benchPieces ?? [])].map((p) => p.piece_id);
  for (const pid of allPieceIds) {
    if (!ownedIds.has(pid)) {
      return c.json({ error: 'PIECE_NOT_OWNED', message: `Piece ${pid} not owned` }, 400);
    }
  }
  // bench + field 間の重複チェック
  if (new Set(allPieceIds).size !== allPieceIds.length) {
    return c.json({ error: 'DUPLICATE_PIECE', message: 'Duplicate piece across field and bench' }, 400);
  }

  const teamId = `team_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    'INSERT INTO teams (id, user_id, name, slot_number, formation_preset, field_pieces, bench_pieces, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      teamId, userId, body.name, slotNumber,
      body.formation_preset ?? '4-4-2',
      JSON.stringify(body.fieldPieces),
      JSON.stringify(body.benchPieces ?? []),
      now, now,
    )
    .run();

  return c.json({ id: teamId, slot_number: slotNumber }, 201);
});

// ── チーム更新 ──
team.put('/:teamId', async (c) => {
  const userId = c.get('userId');
  const teamId = c.req.param('teamId');
  const userToken = getBearerToken(c.req.header('Authorization'));
  const body = await c.req.json<{
    name?: string;
    formation_preset?: string;
    fieldPieces?: FieldPiece[];
    benchPieces?: FieldPiece[];
  }>();

  // 所有権チェック
  const existing = await c.env.DB.prepare(
    'SELECT id, slot_number FROM teams WHERE id = ? AND user_id = ?',
  )
    .bind(teamId, userId)
    .first<{ id: string; slot_number: number | null }>();

  if (!existing) {
    return c.json({ error: 'Team not found' }, 404);
  }

  const slotNumber = existing.slot_number ?? 1;
  const access = await getSaveSlotAccess(c.env, userToken);
  if (slotNumber > access.availableSlots) {
    return c.json({
      error: 'PREMIUM_REQUIRED',
      message: `Slot ${slotNumber} is read-only until the entitlement is active`,
      available_slots: access.availableSlots,
    }, 403);
  }

  if (body.fieldPieces) {
    const fieldError = validateFieldPieces(body.fieldPieces);
    if (fieldError) {
      return c.json({ error: fieldError }, 400);
    }
  }

  // 所持コマ検証（ローカルD1）
  if (body.fieldPieces || body.benchPieces) {
    const ownedIds = await getLocalOwnedPieceIds(c.env.DB, userId);
    const allPieceIds = [
      ...(body.fieldPieces ?? []),
      ...(body.benchPieces ?? []),
    ].map(p => p.piece_id);
    for (const pid of allPieceIds) {
      if (!ownedIds.has(pid)) {
        return c.json({ error: 'PIECE_NOT_OWNED', message: `Piece ${pid} not owned` }, 400);
      }
    }
    if (new Set(allPieceIds).size !== allPieceIds.length) {
      return c.json({ error: 'DUPLICATE_PIECE', message: 'Duplicate piece' }, 400);
    }
  }

  const now = new Date().toISOString();
  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (body.name !== undefined) {
    setClauses.push('name = ?');
    values.push(body.name);
  }
  if (body.formation_preset !== undefined) {
    setClauses.push('formation_preset = ?');
    values.push(body.formation_preset);
  }
  if (body.fieldPieces) {
    setClauses.push('field_pieces = ?');
    values.push(JSON.stringify(body.fieldPieces));
  }
  if (body.benchPieces) {
    setClauses.push('bench_pieces = ?');
    values.push(JSON.stringify(body.benchPieces));
  }
  setClauses.push('updated_at = ?');
  values.push(now);
  values.push(teamId);
  values.push(userId);

  await c.env.DB.prepare(
    `UPDATE teams SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`,
  )
    .bind(...values)
    .run();

  return c.json({ ok: true });
});

// ── スロット有効化（is_active トグル） ──
team.put('/:teamId/activate', async (c) => {
  const userId = c.get('userId');
  const teamId = c.req.param('teamId');

  // 所有権チェック
  const target = await c.env.DB.prepare(
    'SELECT id FROM teams WHERE id = ? AND user_id = ?',
  )
    .bind(teamId, userId)
    .first();

  if (!target) {
    return c.json({ error: 'Team not found' }, 404);
  }

  // 全チームを非アクティブにしてから対象を有効化
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE teams SET is_active = 0 WHERE user_id = ?').bind(userId),
    c.env.DB.prepare('UPDATE teams SET is_active = 1 WHERE id = ? AND user_id = ?').bind(teamId, userId),
  ]);

  return c.json({ active_team_id: teamId });
});

// ── チーム削除 ──
team.delete('/:teamId', async (c) => {
  const userId = c.get('userId');
  const teamId = c.req.param('teamId');

  const result = await c.env.DB.prepare(
    'DELETE FROM teams WHERE id = ? AND user_id = ?',
  )
    .bind(teamId, userId)
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: 'Team not found' }, 404);
  }

  return c.json({ ok: true });
});

export default team;
