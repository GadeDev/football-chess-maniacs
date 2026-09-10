// ============================================================
// com_ai_integration.ts — COM AI命令生成（ルールベース）
//
// サーバーサイドCOM（server_com_）とマッチメイキングのBot補完（com_ai）が使う。
// 2026-09-10 の Owner決定により Workers AI の判断層は削除され、
// ルールベースAIの直呼びに一本化した。
// ============================================================

import type { Order, Piece } from '../engine/types';
import { generateRuleBasedOrders } from '../ai/rule_based';
import type { GameState } from './game_session_helpers';

/**
 * COM対戦用のAI命令を生成する。
 * ルールベースAIは同期・msオーダーで完結するため外側タイムアウトは不要。
 * 例外時は全コマ stay の安全手を返す（DOを落とさない）。
 */
export async function generateComOrders(state: GameState): Promise<Order[]> {
  if (!state.board) return [];

  const pieces = state.board.pieces;

  try {
    return generateRuleBasedOrders({
      pieces,
      myTeam: 'away',
      scoreHome: state.scoreHome,
      scoreAway: state.scoreAway,
      turn: state.turn,
      maxTurn: state.totalTurns,
      remainingSubs: state.remainingSubs[state.awayUserId] ?? 3,
      benchPieces: [] as Piece[],
      maxFieldCost: 16,
      difficulty: state.comDifficulty ?? 'regular',
    }).orders;
  } catch (e) {
    console.error('[GameSession] COM AI error, falling back to stay orders:', e);
    return pieces
      .filter((p) => p.team === 'away')
      .map((p) => ({ pieceId: p.id, type: 'stay' as const }));
  }
}
