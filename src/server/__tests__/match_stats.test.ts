// ============================================================
// match_stats.test.ts — turnLog集計（UF Game Data Contract v1 §3）
// ============================================================

import { describe, it, expect } from 'vitest';
import { computeMatchCounts, teamOfPieceId, type TurnLogEntry } from '../match_stats';

const MATCH_START_MS = 1_000_000;

function entry(overrides: Partial<TurnLogEntry> = {}): TurnLogEntry {
  return {
    turn: 1,
    inputs: {},
    events: [],
    goalScoredBy: null,
    timestamp: MATCH_START_MS + 10_000,
    ...overrides,
  };
}

describe('teamOfPieceId', () => {
  it('h接頭辞はhome', () => {
    expect(teamOfPieceId('h01')).toBe('home');
  });
  it('a接頭辞はaway', () => {
    expect(teamOfPieceId('a03')).toBe('away');
  });
});

describe('computeMatchCounts', () => {
  it('turns_playedはturnLogの長さ', () => {
    const log = [entry(), entry({ timestamp: MATCH_START_MS + 20_000 })];
    const counts = computeMatchCounts(log, 'home', 'user-1', MATCH_START_MS, 0);
    expect(counts.turns_played).toBe(2);
  });

  it('SHOOT: shooterのチームにshotsを計上、goalはoutcomeがgoalの時のみ', () => {
    const log = [
      entry({
        events: [
          { type: 'SHOOT', phase: 2, shooterId: 'h01', coord: { col: 0, row: 0 }, result: { outcome: 'goal' } } as any,
          { type: 'SHOOT', phase: 2, shooterId: 'a02', coord: { col: 0, row: 0 }, result: { outcome: 'missed' } } as any,
        ],
      }),
    ];
    const home = computeMatchCounts(log, 'home', 'user-1', MATCH_START_MS, 0);
    const away = computeMatchCounts(log, 'away', 'user-2', MATCH_START_MS, 0);
    expect(home.shots).toBe(1);
    expect(home.goals).toBe(1);
    expect(away.shots).toBe(1);
    expect(away.goals).toBe(0);
  });

  it('PASS_DELIVERED: passerのチームに計上', () => {
    const log = [
      entry({
        events: [
          { type: 'PASS_DELIVERED', phase: 2, passerId: 'a05', receiverId: 'a06', receiverCoord: { col: 0, row: 0 } } as any,
        ],
      }),
    ];
    expect(computeMatchCounts(log, 'away', 'u', MATCH_START_MS, 0).passes_delivered).toBe(1);
    expect(computeMatchCounts(log, 'home', 'u', MATCH_START_MS, 0).passes_delivered).toBe(0);
  });

  it('PASS_CUT: パスを出した側(passer)にpasses_cut_againstを計上', () => {
    const log = [
      entry({
        events: [
          { type: 'PASS_CUT', phase: 2, passerId: 'h03', receiverId: 'h04', result: { outcome: 'cut1' } } as any,
        ],
      }),
    ];
    expect(computeMatchCounts(log, 'home', 'u', MATCH_START_MS, 0).passes_cut_against).toBe(1);
    expect(computeMatchCounts(log, 'away', 'u', MATCH_START_MS, 0).passes_cut_against).toBe(0);
  });

  it('TACKLE: tackler.teamに計上', () => {
    const log = [
      entry({
        events: [
          {
            type: 'TACKLE', phase: 1, coord: { col: 0, row: 0 },
            result: { tackler: { team: 'home' }, dribbler: { team: 'away' }, outcome: 'tackled' },
          } as any,
        ],
      }),
    ];
    expect(computeMatchCounts(log, 'home', 'u', MATCH_START_MS, 0).tackles).toBe(1);
    expect(computeMatchCounts(log, 'away', 'u', MATCH_START_MS, 0).tackles).toBe(0);
  });

  it('FOUL: tacklerIdのチームに計上', () => {
    const log = [
      entry({
        events: [
          { type: 'FOUL', phase: 1, coord: { col: 0, row: 0 }, tacklerId: 'a09', result: { occurred: true, isPA: false, outcome: 'fk' } } as any,
        ],
      }),
    ];
    expect(computeMatchCounts(log, 'away', 'u', MATCH_START_MS, 0).fouls).toBe(1);
    expect(computeMatchCounts(log, 'home', 'u', MATCH_START_MS, 0).fouls).toBe(0);
  });

  it('OFFSIDE: receiverIdのチームに計上', () => {
    const log = [
      entry({
        events: [
          { type: 'OFFSIDE', phase: 3, receiverId: 'h07', passerId: 'h02', result: { isOffside: true, isGrayZone: false } } as any,
        ],
      }),
    ];
    expect(computeMatchCounts(log, 'home', 'u', MATCH_START_MS, 0).offsides).toBe(1);
    expect(computeMatchCounts(log, 'away', 'u', MATCH_START_MS, 0).offsides).toBe(0);
  });

  it('SUBSTITUTION: event.teamに計上', () => {
    const log = [
      entry({
        events: [
          { type: 'SUBSTITUTION', phase: 0, team: 'away', outPieceId: 'a01', inPieceId: 'a12', coord: { col: 0, row: 0 } } as any,
        ],
      }),
    ];
    expect(computeMatchCounts(log, 'away', 'u', MATCH_START_MS, 0).substitutions_used).toBe(1);
    expect(computeMatchCounts(log, 'home', 'u', MATCH_START_MS, 0).substitutions_used).toBe(0);
  });

  it('turn_timeouts: nonceがtimeout_で始まる入力をカウントし、turn_time_total_secには含めない', () => {
    const log = [
      entry({
        inputs: { 'user-1': { player_id: 'user-1', nonce: 'timeout_1_user-1', timestamp: MATCH_START_MS + 60_000, orders: [] } },
        timestamp: MATCH_START_MS + 60_000,
      }),
    ];
    const counts = computeMatchCounts(log, 'home', 'user-1', MATCH_START_MS, 0);
    expect(counts.turn_timeouts).toBe(1);
    expect(counts.turn_time_total_sec).toBe(0);
  });

  it('turn_time_total_sec: 前ターン終了時刻からの入力送信タイムスタンプ差分を合計', () => {
    const log = [
      entry({
        inputs: { 'user-1': { player_id: 'user-1', nonce: 'abc', timestamp: MATCH_START_MS + 8_000, orders: [] } },
        timestamp: MATCH_START_MS + 10_000,
      }),
      entry({
        inputs: { 'user-1': { player_id: 'user-1', nonce: 'def', timestamp: MATCH_START_MS + 25_000, orders: [] } },
        timestamp: MATCH_START_MS + 30_000,
      }),
    ];
    // turn1: 8000 - 0 = 8s / turn2: 25000-10000=15000ms=15s → 合計23s
    const counts = computeMatchCounts(log, 'home', 'user-1', MATCH_START_MS, 0);
    expect(counts.turn_time_total_sec).toBe(23);
  });

  it('入力が存在しないターンは turn_timeouts にも turn_time_total_sec にもカウントしない（COM側等）', () => {
    const log = [entry({ inputs: {} })];
    const counts = computeMatchCounts(log, 'away', 'com_ai', MATCH_START_MS, 0);
    expect(counts.turn_timeouts).toBe(0);
    expect(counts.turn_time_total_sec).toBe(0);
  });
});
