// ============================================================
// platform_match_report.ts — 試合結果をUF Game Data Contract v1準拠で
// Football-Platform（POST /v1/game/matches/finish）へ送信する。
//
// 呼び出し元: worker.ts の Queues Consumer（試合終了時のD1/R2永続化と並行）。
// 送信の成否はD1/R2永続化に一切影響しない設計（呼び出し側で完全に独立したtry/catchに包むこと）。
// ============================================================

import { callPlatformApi, PlatformApiError } from '../api/auth';
import type { Env } from '../worker';
import { computeMatchCounts, type MatchCounts, type TurnLogEntry } from './match_stats';

export type MatchMode = 'ranked' | 'casual' | 'friend' | 'com';

export interface MatchFinishSourceData {
  matchId: string;
  homeUserId: string;
  awayUserId: string;
  scoreHome: number;
  scoreAway: number;
  reason: string;
  disconnectLoser?: 'home' | 'away';
  turnLog: TurnLogEntry[];
  /** ISO8601（D1 matches.created_at 由来） */
  matchCreatedAtIso: string;
  /** ISO8601（試合終了時刻） */
  finishedAtIso: string;
}

export interface MatchFinishParticipantPayload {
  user_id: string | null;
  guest_session_id: string | null;
  side: 'home' | 'away';
  stats: {
    contract_version: 1;
    opponent_type: 'human' | 'cpu';
    counts: MatchCounts;
    flags: {
      won: boolean;
      disconnect_loss: boolean;
    };
  };
}

export interface MatchFinishPayload {
  external_match_id: string;
  mode: MatchMode;
  started_at: string;
  ended_at: string;
  duration_sec: number;
  winner_side: 'home' | 'away' | null;
  score: { home: number; away: number };
  participants: MatchFinishParticipantPayload[];
}

const COM_PSEUDO_USER_ID = 'com_ai';

/** matchId のprefix規約からモードを判定（server/rating.ts の isRatedMatch と同じ規約） */
export function resolveMatchMode(matchId: string): MatchMode {
  if (matchId.startsWith('friend_')) return 'friend';
  if (matchId.startsWith('casual_')) return 'casual';
  if (matchId.startsWith('com_') || matchId.startsWith('gemma_com_')) return 'com';
  return 'ranked';
}

/** 勝敗（home/away視点）。引き分けはnull */
export function resolveWinnerSide(
  scoreHome: number,
  scoreAway: number,
  reason: string,
  disconnectLoser: 'home' | 'away' | undefined,
): 'home' | 'away' | null {
  if (reason === 'disconnect' && disconnectLoser) {
    return disconnectLoser === 'home' ? 'away' : 'home';
  }
  if (scoreHome > scoreAway) return 'home';
  if (scoreAway > scoreHome) return 'away';
  return null;
}

/** COM対戦のゲスト擬似ID（com_player_*）か否か */
function isGuestPseudoId(userId: string): boolean {
  return userId.startsWith('com_player_');
}

function buildParticipant(
  userId: string,
  side: 'home' | 'away',
  opponentType: 'human' | 'cpu',
  counts: MatchCounts,
  won: boolean,
  disconnectLoser: 'home' | 'away' | undefined,
): MatchFinishParticipantPayload {
  return {
    user_id: isGuestPseudoId(userId) ? null : userId,
    guest_session_id: isGuestPseudoId(userId) ? userId : null,
    side,
    stats: {
      contract_version: 1,
      opponent_type: opponentType,
      counts,
      flags: {
        won,
        disconnect_loss: disconnectLoser === side,
      },
    },
  };
}

/**
 * MatchFinishRequest を組み立てる（純粋関数）。
 * COM対戦（片側が'com_ai'）はCOM側をparticipantsから除外し、人間側1名のみ opponent_type='cpu' で送る。
 * 集計不能な値（生成物にないためturnLogから復元できない値）は仕様通り省略し、無理に作らない。
 */
export function buildMatchFinishPayload(data: MatchFinishSourceData): MatchFinishPayload {
  const mode = resolveMatchMode(data.matchId);
  const opponentType: 'human' | 'cpu' = mode === 'com' ? 'cpu' : 'human';
  const winnerSide = resolveWinnerSide(data.scoreHome, data.scoreAway, data.reason, data.disconnectLoser);
  const matchStartedAtMs = Date.parse(data.matchCreatedAtIso);
  const finishedAtMs = Date.parse(data.finishedAtIso);
  const durationSec = Number.isFinite(matchStartedAtMs) && Number.isFinite(finishedAtMs)
    ? Math.max(0, Math.round((finishedAtMs - matchStartedAtMs) / 1000))
    : 0;

  const sides: Array<{ userId: string; side: 'home' | 'away' }> = [
    { userId: data.homeUserId, side: 'home' as const },
    { userId: data.awayUserId, side: 'away' as const },
  ].filter((s) => s.userId !== COM_PSEUDO_USER_ID);

  const participants = sides.map(({ userId, side }) => {
    const team = side;
    const counts = computeMatchCounts(data.turnLog, team, userId, matchStartedAtMs, durationSec);
    const won = winnerSide === side;
    return buildParticipant(userId, side, opponentType, counts, won, data.disconnectLoser);
  });

  return {
    external_match_id: data.matchId,
    mode,
    started_at: data.matchCreatedAtIso,
    ended_at: data.finishedAtIso,
    duration_sec: durationSec,
    winner_side: winnerSide,
    score: { home: data.scoreHome, away: data.scoreAway },
    participants,
  };
}

/**
 * Platformへ試合結果を送信する。gfp_トークン未設定・Platform障害時は送信を保留（ログのみ）し、
 * 例外を投げない（呼び出し側のD1/R2永続化・Queueのack/retryに一切影響を与えないため）。
 */
export async function sendMatchFinishReport(
  env: Env['Bindings'],
  data: MatchFinishSourceData,
): Promise<void> {
  if (!env.PLATFORM_GAME_SERVER_TOKEN) {
    console.warn(`[platform_match_report] PLATFORM_GAME_SERVER_TOKEN not configured, skipping finish report for ${data.matchId}`);
    return;
  }

  const payload = buildMatchFinishPayload(data);
  if (payload.participants.length === 0) return;

  try {
    await callPlatformApi(env, '/v1/game/matches/finish', {
      method: 'POST',
      authMode: 'game',
      body: JSON.stringify(payload),
    });
  } catch (e) {
    if (e instanceof PlatformApiError) {
      console.error(`[platform_match_report] finish report failed for ${data.matchId}: ${e.status} ${e.body}`);
    } else {
      console.error(`[platform_match_report] finish report failed for ${data.matchId}:`, e);
    }
  }
}
