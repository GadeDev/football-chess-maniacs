// ============================================================
// match_stats.ts — turnLog（GameSession DOのターン記録）からPlatform送信用の
// 参加者別カウントを集計する純粋関数群（UF Game Data Contract v1 §3準拠）。
//
// turnLog は Cloudflare Queue のメッセージペイロードとして JSON を経由するため、
// GameEvent の型は保たれるがクラスメソッド等は失われる（プレーンオブジェクトとして扱う）。
// ============================================================

import type { GameEvent, Team } from '../engine/types';

/** 1ターン分の入力（送信/未送信を問わず、DOが記録した実際の値） */
export interface TurnLogInput {
  player_id: string;
  nonce: string;
  timestamp: number;
  orders: unknown[];
}

/** GameState.turnLog の1要素（durable/game_session.ts の resolveTurn が push する形） */
export interface TurnLogEntry {
  turn: number;
  inputs: Record<string, TurnLogInput | undefined>;
  events: GameEvent[];
  goalScoredBy: 'home' | 'away' | null;
  timestamp: number;
}

export interface MatchCounts {
  turns_played: number;
  goals: number;
  shots: number;
  passes_delivered: number;
  passes_cut_against: number;
  tackles: number;
  fouls: number;
  offsides: number;
  substitutions_used: number;
  turn_timeouts: number;
  turn_time_total_sec: number;
  /** 試合全体の経過秒（両参加者共通の値。呼び出し側でduration_secを付与する） */
  duration_sec: number;
}

/** コマID接頭辞（h/a）からチームを判定（エンジン全体で使われる規約、game_session_helpers.ts placeTeam 参照） */
export function teamOfPieceId(pieceId: string): Team {
  return pieceId.startsWith('h') ? 'home' : 'away';
}

/** タイムアウトによる自動空入力かどうか（createEmptyTurnInput の nonce 規約に依存） */
function isTimeoutInput(input: TurnLogInput | undefined): boolean {
  return input?.nonce?.startsWith('timeout_') ?? false;
}

/**
 * 指定チーム/ユーザー視点で turnLog を集計する。
 * turn_time_total_sec は「そのターンの開始時刻（＝前ターンの解決時刻。初ターンは matchStartedAtMs）」から
 * 実際に入力を送信した時刻までの差分の合計（タイムアウトターンは含めない）。
 */
export function computeMatchCounts(
  turnLog: TurnLogEntry[],
  team: Team,
  userId: string,
  matchStartedAtMs: number,
  matchDurationSec: number,
): MatchCounts {
  let goals = 0;
  let shots = 0;
  let passesDelivered = 0;
  let passesCutAgainst = 0;
  let tackles = 0;
  let fouls = 0;
  let offsides = 0;
  let substitutionsUsed = 0;
  let turnTimeouts = 0;
  let turnTimeTotalMs = 0;
  let prevTurnEndMs = matchStartedAtMs;

  for (const entry of turnLog) {
    for (const ev of entry.events ?? []) {
      switch (ev.type) {
        case 'SHOOT':
          if (teamOfPieceId(ev.shooterId) === team) {
            shots++;
            if (ev.result.outcome === 'goal') goals++;
          }
          break;
        case 'PASS_DELIVERED':
          if (teamOfPieceId(ev.passerId) === team) passesDelivered++;
          break;
        case 'PASS_CUT':
          // カットされた側（パスを出した側）に計上する
          if (teamOfPieceId(ev.passerId) === team) passesCutAgainst++;
          break;
        case 'TACKLE':
          if (ev.result.tackler.team === team) tackles++;
          break;
        case 'FOUL':
          // ファウルを犯したのはタックルを仕掛けた側（tacklerId）
          if (teamOfPieceId(ev.tacklerId) === team) fouls++;
          break;
        case 'OFFSIDE':
          if (teamOfPieceId(ev.receiverId) === team) offsides++;
          break;
        case 'SUBSTITUTION':
          if (ev.team === team) substitutionsUsed++;
          break;
        default:
          break;
      }
    }

    const input = entry.inputs?.[userId];
    if (isTimeoutInput(input)) {
      turnTimeouts++;
    } else if (input && typeof input.timestamp === 'number') {
      turnTimeTotalMs += Math.max(0, input.timestamp - prevTurnEndMs);
    }
    prevTurnEndMs = entry.timestamp;
  }

  return {
    turns_played: turnLog.length,
    goals,
    shots,
    passes_delivered: passesDelivered,
    passes_cut_against: passesCutAgainst,
    tackles,
    fouls,
    offsides,
    substitutions_used: substitutionsUsed,
    turn_timeouts: turnTimeouts,
    turn_time_total_sec: Math.round(turnTimeTotalMs / 1000),
    duration_sec: matchDurationSec,
  };
}
