// ============================================================
// com_ai_integration.test.ts
//   generateComOrders の検証。
//   2026-09-10 の Workers AI 判断層削除により、
//   ルールベースAI直呼び／例外時 stay の安全手であることを担保する。
// ============================================================

import { describe, it, expect, vi } from 'vitest';

const generateRuleBasedOrdersMock = vi.hoisted(() => vi.fn());
vi.mock('../../ai/rule_based', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ai/rule_based')>();
  generateRuleBasedOrdersMock.mockImplementation(actual.generateRuleBasedOrders);
  return { ...actual, generateRuleBasedOrders: generateRuleBasedOrdersMock };
});

import { generateComOrders } from '../com_ai_integration';
import { createInitialBoard, type GameState } from '../game_session_helpers';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    matchId: 'server_com_1',
    homeUserId: 'u1',
    awayUserId: 'com_ai',
    turn: 1,
    board: createInitialBoard('home'),
    scoreHome: 0,
    scoreAway: 0,
    status: 'playing',
    turnStartedAt: null,
    lastSequences: {},
    usedNonces: [],
    turnInputs: {},
    remainingSubs: {},
    disconnectedPlayers: {},
    turnLog: [],
    half: 1,
    firstHalfAT: 1,
    secondHalfAT: 1,
    halfTimeTurn: 16,
    totalTurns: 32,
    kickoffTeam: 'home',
    isComMatch: true,
    ...overrides,
  };
}

describe('generateComOrders', () => {
  it('盤面がない場合は空配列を返す', async () => {
    const orders = await generateComOrders(makeState({ board: null }));
    expect(orders).toEqual([]);
  });

  it('ルールベースAIでaway側の命令を生成する', async () => {
    const orders = await generateComOrders(makeState());
    expect(orders.length).toBeGreaterThan(0);
    const awayIds = new Set(
      createInitialBoard('home').pieces.filter((p) => p.team === 'away').map((p) => p.id),
    );
    for (const o of orders) {
      expect(awayIds.has(o.pieceId)).toBe(true);
    }
  });

  it('AI生成が失敗した場合は全away駒のstayに退避する', async () => {
    generateRuleBasedOrdersMock.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const state = makeState();
    const orders = await generateComOrders(state);
    const awayCount = state.board!.pieces.filter((p) => p.team === 'away').length;
    expect(orders).toHaveLength(awayCount);
    expect(orders.every((o) => o.type === 'stay')).toBe(true);
  });
});
