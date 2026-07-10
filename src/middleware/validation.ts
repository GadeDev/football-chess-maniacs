// ============================================================
// validation.ts — サーバーサイド入力バリデーション（§7-3 全14項目）
// ============================================================

import type { Order, HexCoord, Position } from '../engine/types';

/** ターン入力メッセージ（§3-2） */
export interface TurnInput {
  match_id: string;
  turn: number;
  player_id: string;
  sequence: number;
  nonce: string;
  orders: RawOrder[];
  client_hash: string;
  timestamp: number;
}

/** クライアントから受信する生の指示 */
export interface RawOrder {
  piece_id: string;
  action: string;
  target_hex?: [number, number];
  target_piece?: string;
  bench_piece?: string;
}

/** バリデーション対象のコマ情報 */
export interface PieceInfo {
  id: string;
  team: 'home' | 'away';
  position: Position;
  cost: number;
  coord: HexCoord;
  hasBall: boolean;
  /** 移動力（ゾーンボーナス・コスト修正込み） */
  moveRange: number;
  /** ベンチか否か */
  isBench: boolean;
}

/** バリデーション結果 */
export interface ValidationResult {
  /** 検証通過した指示 */
  validOrders: RawOrder[];
  /** 全指示無視か（#1~#4違反時） */
  rejected: boolean;
  /** 個別に無視された指示。共有層は翻訳せず、code + params だけを返す。 */
  violations: Array<{
    order: RawOrder;
    rule: number;
    code: ValidationViolationCode;
    params?: Record<string, string | number>;
  }>;
}

export type ValidationViolationCode =
  | 'UNKNOWN_PLAYER'
  | 'INVALID_SEQUENCE'
  | 'DUPLICATE_NONCE'
  | 'TIMESTAMP_OUT_OF_RANGE'
  | 'NOT_OWN_FIELD_PIECE'
  | 'DUPLICATE_PIECE_ID'
  | 'INVALID_ACTION'
  | 'TARGET_HEX_OUT_OF_BOUNDS'
  | 'MOVE_EXCEEDS_RANGE'
  | 'MISSING_ACTION_TARGET'
  | 'NON_BALL_HOLDER_ACTION'
  | 'NO_SUBSTITUTION_SLOTS'
  | 'MISSING_BENCH_PIECE'
  | 'INVALID_BENCH_PIECE'
  | 'FIELD_COST_EXCEEDED';

const VALID_ACTIONS = new Set(['move', 'pass', 'shoot', 'dribble', 'substitute', 'skill']);
const MAX_ORDERS = 11;
const BOARD_MAX_COL = 21;
const BOARD_MAX_ROW = 33;
const FIELD_MAX_COST = 16;
const TIMESTAMP_TOLERANCE_MS = 5000;

/**
 * §7-3 サーバーサイド入力バリデーション（全14項目）
 *
 * @param input    受信したターン入力
 * @param matchId  正規のマッチID
 * @param players  この試合の参加プレイヤーID一覧
 * @param lastSequences  各プレイヤーの最終sequence
 * @param usedNonces     使用済みnonce集合
 * @param pieces   フィールド上のコマ一覧（プレイヤー所属込み）
 * @param playerTeam  入力プレイヤーのチーム
 * @param remainingSubs  残り交代回数
 */
export function validateTurnInput(
  input: TurnInput,
  matchId: string,
  players: string[],
  lastSequences: Map<string, number>,
  usedNonces: Set<string>,
  pieces: PieceInfo[],
  playerTeam: 'home' | 'away',
  remainingSubs: number,
): ValidationResult {
  const violations: ValidationResult['violations'] = [];

  // ── #1: player_idが当該試合の参加者か ──
  if (!players.includes(input.player_id)) {
    return { validOrders: [], rejected: true, violations: [{ order: {} as RawOrder, rule: 1, code: 'UNKNOWN_PLAYER' }] };
  }

  // ── #2: sequenceが前回+1の単調増加か ──
  const lastSeq = lastSequences.get(input.player_id) ?? -1;
  if (input.sequence !== lastSeq + 1) {
    return { validOrders: [], rejected: true, violations: [{ order: {} as RawOrder, rule: 2, code: 'INVALID_SEQUENCE' }] };
  }

  // ── #3: nonceが未使用か ──
  if (usedNonces.has(input.nonce)) {
    return { validOrders: [], rejected: true, violations: [{ order: {} as RawOrder, rule: 3, code: 'DUPLICATE_NONCE' }] };
  }

  // ── #4: timestampが現在時刻±5秒以内か ──
  const now = Date.now();
  if (Math.abs(input.timestamp - now) > TIMESTAMP_TOLERANCE_MS) {
    return { validOrders: [], rejected: true, violations: [{ order: {} as RawOrder, rule: 4, code: 'TIMESTAMP_OUT_OF_RANGE', params: { toleranceMs: TIMESTAMP_TOLERANCE_MS } }] };
  }

  // ── #5: ordersの件数が11以下か（超過分切り捨て） ──
  let orders = input.orders;
  if (orders.length > MAX_ORDERS) {
    orders = orders.slice(0, MAX_ORDERS);
  }

  const myPieces = pieces.filter((p) => p.team === playerTeam && !p.isBench);
  const myPieceMap = new Map(myPieces.map((p) => [p.id, p]));
  const seenPieceIds = new Set<string>();
  const validOrders: RawOrder[] = [];
  let pendingSubCost = 0;
  let subCount = 0;

  for (const order of orders) {
    // ── #6: piece_idが自チームのフィールドコマか ──
    const piece = myPieceMap.get(order.piece_id);
    if (!piece) {
      violations.push({ order, rule: 6, code: 'NOT_OWN_FIELD_PIECE', params: { pieceId: order.piece_id } });
      continue;
    }

    // ── #7: 同一piece_idが重複していないか ──
    if (seenPieceIds.has(order.piece_id)) {
      violations.push({ order, rule: 7, code: 'DUPLICATE_PIECE_ID', params: { pieceId: order.piece_id } });
      continue;
    }
    seenPieceIds.add(order.piece_id);

    // ── #8: actionが許可された値か ──
    if (!VALID_ACTIONS.has(order.action)) {
      violations.push({ order, rule: 8, code: 'INVALID_ACTION', params: { action: order.action } });
      continue;
    }

    // ── #9: target_hexがボード範囲内か ──
    if (order.target_hex) {
      const [col, row] = order.target_hex;
      if (col < 0 || col > BOARD_MAX_COL || row < 0 || row > BOARD_MAX_ROW) {
        violations.push({ order, rule: 9, code: 'TARGET_HEX_OUT_OF_BOUNDS', params: { col, row } });
        continue;
      }
    }

    // ── #10: 移動距離がコマの移動力以内か ──
    if (order.action === 'move' && order.target_hex) {
      const dist = hexDistance(piece.coord, { col: order.target_hex[0], row: order.target_hex[1] });
      if (dist > piece.moveRange) {
        violations.push({ order, rule: 10, code: 'MOVE_EXCEEDS_RANGE', params: { distance: dist, range: piece.moveRange } });
        continue;
      }
    }

    // ── #11: パス/シュートのtargetが有効か ──
    if ((order.action === 'pass' || order.action === 'shoot') && !order.target_piece && !order.target_hex) {
      violations.push({ order, rule: 11, code: 'MISSING_ACTION_TARGET', params: { action: order.action } });
      continue;
    }

    // ── #14: ボール保持コマ以外がpass/shoot/dribbleしていないか ──
    if (['pass', 'shoot', 'dribble'].includes(order.action) && !piece.hasBall) {
      violations.push({ order, rule: 14, code: 'NON_BALL_HOLDER_ACTION', params: { action: order.action, pieceId: order.piece_id } });
      continue;
    }

    // ── #12 & #13: 交代チェック ──
    if (order.action === 'substitute') {
      // #13: 交代回数が残り枠以内か
      subCount++;
      if (subCount > remainingSubs) {
        violations.push({ order, rule: 13, code: 'NO_SUBSTITUTION_SLOTS' });
        continue;
      }
      // #12は交代後の総コスト計算（bench_pieceの情報が必要）
      // ここでは簡易チェック：ベンチコマの存在だけ確認
      if (!order.bench_piece) {
        violations.push({ order, rule: 12, code: 'MISSING_BENCH_PIECE' });
        continue;
      }
      const benchPiece = pieces.find((p) => p.id === order.bench_piece && p.isBench && p.team === playerTeam);
      if (!benchPiece) {
        violations.push({ order, rule: 12, code: 'INVALID_BENCH_PIECE', params: { pieceId: order.bench_piece } });
        continue;
      }
      // 総コスト検証
      const costChange = benchPiece.cost - piece.cost;
      pendingSubCost += costChange;
      const totalFieldCost = myPieces.reduce((sum, p) => sum + p.cost, 0) + pendingSubCost;
      if (totalFieldCost > FIELD_MAX_COST) {
        violations.push({ order, rule: 12, code: 'FIELD_COST_EXCEEDED', params: { cost: totalFieldCost, max: FIELD_MAX_COST } });
        pendingSubCost -= costChange; // ロールバック
        subCount--;
        continue;
      }
    }

    validOrders.push(order);
  }

  return { validOrders, rejected: false, violations };
}

/** HEXグリッド上の距離計算（odd-q offset → cube → distance） */
function hexDistance(a: HexCoord, b: HexCoord): number {
  const aCube = offsetToCube(a);
  const bCube = offsetToCube(b);
  return Math.max(
    Math.abs(aCube.q - bCube.q),
    Math.abs(aCube.r - bCube.r),
    Math.abs(aCube.s - bCube.s),
  );
}

function offsetToCube(h: HexCoord): { q: number; r: number; s: number } {
  const q = h.col;
  const r = h.row - Math.floor((h.col - (h.col & 1)) / 2);
  const s = -q - r;
  return { q, r, s };
}
