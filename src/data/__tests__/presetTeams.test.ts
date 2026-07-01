import { describe, expect, it } from 'vitest';
import { NPC_TEAMS } from '../npc_teams';
import { PRESET_TEAMS, pickNpcOpponent } from '../presetTeams';

describe('PRESET_TEAMS', () => {
  it('NPCチーム定義から世界観プリセットを生成する', () => {
    expect(PRESET_TEAMS).toHaveLength(NPC_TEAMS.length);
    expect(PRESET_TEAMS[0].id).toBe('npc_shelf_1');
    expect(PRESET_TEAMS[0].name).toBe('草創期オールスター');
    expect(PRESET_TEAMS[0].nameEn).toBe('Dawn All-Stars');
  });

  it('全チームが11人・表示情報・コスト集計を持つ', () => {
    for (const team of PRESET_TEAMS) {
      expect(team.pieces).toHaveLength(11);
      expect(team.totalCost).toBe(team.pieces.reduce((sum, piece) => sum + piece.cost, 0));

      for (const piece of team.pieces) {
        expect(piece.pieceId).toBeGreaterThan(0);
        expect(piece.name).not.toBe('');
        expect(piece.nameEn).not.toBe('');
        expect(piece.summary).not.toBe('');
        expect([1, 1.5, 2, 2.5, 3]).toContain(piece.cost);
      }
    }
  });

  it('NPC配置はaway側座標として保持する', () => {
    for (const team of PRESET_TEAMS) {
      for (const piece of team.pieces) {
        expect(piece.col).toBeGreaterThanOrEqual(0);
        expect(piece.col).toBeLessThanOrEqual(21);
        expect(piece.row).toBeGreaterThanOrEqual(17);
        expect(piece.row).toBeLessThanOrEqual(33);
      }
    }
  });
});

describe('pickNpcOpponent', () => {
  it('常にPRESET_TEAMSの中から1チームを返す', () => {
    for (let i = 0; i < 20; i++) {
      const picked = pickNpcOpponent();
      expect(PRESET_TEAMS.some(t => t.id === picked.id)).toBe(true);
    }
  });

  it('beginnerは低コスト寄りのプールから選出する', () => {
    const sorted = [...PRESET_TEAMS].sort((a, b) => a.totalCost - b.totalCost);
    const poolSize = Math.ceil(sorted.length / 3);
    const lowCostIds = new Set(sorted.slice(0, poolSize).map(t => t.id));
    for (let i = 0; i < 20; i++) {
      expect(lowCostIds.has(pickNpcOpponent('beginner').id)).toBe(true);
    }
  });

  it('maniacは高コスト寄りのプールから選出する', () => {
    const sorted = [...PRESET_TEAMS].sort((a, b) => a.totalCost - b.totalCost);
    const poolSize = Math.ceil(sorted.length / 3);
    const highCostIds = new Set(sorted.slice(sorted.length - poolSize).map(t => t.id));
    for (let i = 0; i < 20; i++) {
      expect(highCostIds.has(pickNpcOpponent('maniac').id)).toBe(true);
    }
  });
});
