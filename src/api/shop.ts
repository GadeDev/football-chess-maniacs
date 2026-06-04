// ============================================================
// shop.ts — ショップAPI
// GET  /api/shop/catalog  — piece_master 一覧（フィルタ付き）
// GET  /api/shop/wallet   — インゴット残高
// POST /api/shop/purchase — インゴットでコマ購入（D1で減算→付与）
// POST /api/shop/ingots   — インゴットをPlatform決済で購入
// ============================================================

import { Hono } from 'hono';
import type { Env } from '../worker';
import { callPlatformApi } from './auth';
import { costToDisplay, pieceCostToIngots, SHELF_NAMES } from '../types/piece';
import type { PieceMaster, ShopCatalogItem } from '../types/piece';

const shop = new Hono<{
  Bindings: Env['Bindings'];
  Variables: { userId?: string };
}>();

/**
 * GET /api/shop/catalog
 * クエリパラメータ: position, era_shelf, family, category(ss), limit, offset
 * userId があれば is_owned を返す（JWT optional）
 */
shop.get('/catalog', async (c) => {
  const position = c.req.query('position');
  const eraShelf = c.req.query('era_shelf');
  const family = c.req.query('family');
  const category = c.req.query('category'); // 'ss' for cost=3
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(c.req.query('offset') ?? '0', 10) || 0, 0);

  // クエリ構築
  const conditions: string[] = ['is_purchasable = 1'];
  const binds: (string | number)[] = [];

  if (position) {
    conditions.push('position = ?');
    binds.push(position.toUpperCase());
  }
  if (eraShelf) {
    const shelf = parseInt(eraShelf, 10);
    if (shelf >= 1 && shelf <= 7) {
      conditions.push('era_shelf = ?');
      binds.push(shelf);
    }
  }
  if (family) {
    conditions.push('family = ?');
    binds.push(family.toLowerCase());
  }
  if (category === 'ss') {
    conditions.push('cost = 3');
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // カウント取得
  const countResult = await c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM piece_master ${whereClause}`,
  )
    .bind(...binds)
    .first<{ total: number }>();

  // データ取得
  const result = await c.env.DB.prepare(
    `SELECT * FROM piece_master ${whereClause} ORDER BY piece_id ASC LIMIT ? OFFSET ?`,
  )
    .bind(...binds, limit, offset)
    .all<PieceMaster>();

  // is_owned 判定（userIdがある場合のみ）
  const userId = c.get('userId');
  let ownedSet = new Set<number>();
  if (userId && result.results.length > 0) {
    const pieceIds = result.results.map((r) => r.piece_id);
    const placeholders = pieceIds.map(() => '?').join(',');
    const owned = await c.env.DB.prepare(
      `SELECT piece_id FROM user_pieces_v2 WHERE user_id = ? AND piece_id IN (${placeholders})`,
    )
      .bind(userId, ...pieceIds)
      .all<{ piece_id: number }>();
    ownedSet = new Set(owned.results.map((r) => r.piece_id));
  }

  const items: ShopCatalogItem[] = result.results.map((p) => ({
    piece_id: p.piece_id,
    sku: p.sku,
    name_ja: p.name_ja,
    name_en: p.name_en,
    position: p.position,
    cost: p.cost,
    cost_display: costToDisplay(p.cost),
    era: p.era,
    era_shelf: p.era_shelf,
    era_shelf_name: SHELF_NAMES[p.era_shelf]?.en ?? 'Unknown',
    family: p.family,
    nationality: p.nationality,
    summary_ja: p.summary_ja,
    image_url: p.image_url,
    is_owned: ownedSet.has(p.piece_id),
  }));

  return c.json({
    items,
    total: countResult?.total ?? 0,
    limit,
    offset,
  });
});

/**
 * GET /api/shop/wallet
 * インゴット残高を返す（未作成ユーザーは 0）
 */
shop.get('/wallet', async (c) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const row = await c.env.DB.prepare(
    'SELECT ingots FROM user_wallets WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ ingots: number }>();

  return c.json({ ingots: row?.ingots ?? 0 });
});

/**
 * POST /api/shop/purchase
 * Body: { piece_id: number }
 * インゴットを D1 で減算し、コマを付与する（サーバー権威）。
 */
shop.post('/purchase', async (c) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let body: { piece_id?: unknown };
  try {
    body = await c.req.json<{ piece_id?: unknown }>();
  } catch {
    return c.json({ error: 'VALIDATION_ERROR', message: 'Invalid JSON' }, 400);
  }
  if (typeof body.piece_id !== 'number' || !Number.isInteger(body.piece_id)) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'piece_id is required' }, 400);
  }
  const pieceId = body.piece_id;

  // piece_master 存在確認 + is_purchasable + cost
  const piece = await c.env.DB.prepare(
    'SELECT piece_id, cost, is_purchasable FROM piece_master WHERE piece_id = ?',
  )
    .bind(pieceId)
    .first<{ piece_id: number; cost: number; is_purchasable: number }>();

  if (!piece) {
    return c.json({ error: 'INVALID_PIECE_ID', message: 'Piece not found' }, 400);
  }
  if (!piece.is_purchasable) {
    return c.json({ error: 'NOT_PURCHASABLE', message: 'This piece cannot be purchased' }, 400);
  }

  // 所持確認（二重購入防止）
  const existing = await c.env.DB.prepare(
    'SELECT 1 FROM user_pieces_v2 WHERE user_id = ? AND piece_id = ?',
  )
    .bind(userId, pieceId)
    .first();

  if (existing) {
    return c.json({ error: 'ALREADY_OWNED', message: 'You already own this piece' }, 409);
  }

  const price = pieceCostToIngots(piece.cost);
  const now = new Date().toISOString();

  // 残高確認 + ガード付き減算（ingots >= price のときのみ成立）
  const debit = await c.env.DB.prepare(
    'UPDATE user_wallets SET ingots = ingots - ?, updated_at = ? WHERE user_id = ? AND ingots >= ?',
  )
    .bind(price, now, userId, price)
    .run();

  if (debit.meta.changes === 0) {
    const wallet = await c.env.DB.prepare(
      'SELECT ingots FROM user_wallets WHERE user_id = ?',
    )
      .bind(userId)
      .first<{ ingots: number }>();
    return c.json(
      {
        error: 'INSUFFICIENT_INGOTS',
        message: 'Not enough ingots',
        balance: wallet?.ingots ?? 0,
        price,
      },
      402,
    );
  }

  // コマ付与。失敗時はインゴットを返金
  try {
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO user_pieces_v2 (user_id, piece_id, source, entitlement_id, acquired_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(userId, pieceId, 'purchase', null, now)
      .run();
  } catch (e) {
    await c.env.DB.prepare(
      'UPDATE user_wallets SET ingots = ingots + ?, updated_at = ? WHERE user_id = ?',
    )
      .bind(price, now, userId)
      .run();
    console.error('[shop] Grant failed, refunded ingots:', e);
    return c.json({ error: 'INTERNAL_ERROR', message: 'Failed to grant piece' }, 500);
  }

  // 所持コマキャッシュ無効化
  await c.env.KV.delete(`owned_pieces:${userId}`);

  const balance = await c.env.DB.prepare(
    'SELECT ingots FROM user_wallets WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ ingots: number }>();

  return c.json({ piece_id: pieceId, price, balance: balance?.ingots ?? 0 }, 201);
});

/**
 * POST /api/shop/ingots
 * Body: { sku?: string }  — 省略時は標準インゴットバンドル
 * Platform の /v1/commerce/purchase を呼んで checkout_url を返す。
 * インゴットはプラットフォーム決済で購入し、Webhook 経由でウォレットに加算される。
 */
const DEFAULT_INGOT_SKU = 'fcms_ingots_standard';
const ALLOWED_INGOT_SKUS = new Set([
  'fcms_ingots_standard',
  'fcms_ingots_plus',
  'fcms_ingots_mega',
]);

shop.post('/ingots', async (c) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  let sku = DEFAULT_INGOT_SKU;
  try {
    const body = await c.req.json<{ sku?: string }>();
    if (body.sku) {
      if (!ALLOWED_INGOT_SKUS.has(body.sku)) {
        return c.json({ error: 'INVALID_SKU', message: 'Unknown ingot SKU' }, 400);
      }
      sku = body.sku;
    }
  } catch {
    // ボディなし → デフォルトSKU
  }

  try {
    const result = await callPlatformApi<{
      purchase_id: string;
      checkout_url: string;
      status: string;
    }>(c.env, '/v1/commerce/purchase', {
      method: 'POST',
      body: JSON.stringify({ sku, user_id: userId }),
    });

    return c.json(
      {
        purchase_id: result.purchase_id,
        checkout_url: result.checkout_url,
        status: result.status,
      },
      201,
    );
  } catch (e) {
    console.error('[shop] Ingot purchase API error:', e);
    return c.json({ error: 'INTERNAL_ERROR', message: 'Failed to initiate ingot purchase' }, 500);
  }
});

export default shop;
