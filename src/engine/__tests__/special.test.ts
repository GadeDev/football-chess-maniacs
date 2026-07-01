// ============================================================
// special.test.ts — フェーズ3: オフサイド処理（processSpecial）
//   グレーゾーン(50%乱数)を避け、確定OS/確定オンサイドで決定的に検証。
// ============================================================

import { describe, it, expect } from 'vitest';
import { processSpecial } from '../special';
import { eventsOfType } from '../turn_processor';
import type { Piece, OffsideEvent, BallAcquiredEvent } from '../types';

function p(overrides: Partial<Piece> & Pick<Piece, 'id' | 'team' | 'position' | 'coord'>): Piece {
  return { cost: 2, hasBall: false, ...overrides };
}

// home が高row方向(33)へ攻撃。守備=away。GK除外の最後方FP(ad1 row20)がオフサイドライン基準。
function scenario(receiverRow: number) {
  const hp = p({ id: 'hp', team: 'home', position: 'MF', coord: { col: 10, row: 18 } });
  const hr = p({ id: 'hr', team: 'home', position: 'FW', coord: { col: 10, row: receiverRow }, hasBall: true });
  const agk = p({ id: 'agk', team: 'away', position: 'GK', coord: { col: 10, row: 33 } });
  const ad1 = p({ id: 'ad1', team: 'away', position: 'DF', coord: { col: 12, row: 20 } });
  const pieces = [hp, hr, agk, ad1];
  const snapshot = pieces.map(x => ({ ...x, coord: { ...x.coord } }));
  return { pieces, snapshot };
}

describe('processSpecial — オフサイド判定', () => {
  it('deliveredPass が null なら判定スキップ（イベントなし・ボール不変）', () => {
    const { pieces, snapshot } = scenario(10);
    const res = processSpecial(pieces, snapshot, null);
    expect(res.events).toHaveLength(0);
    expect(res.pieces.find(x => x.id === 'hr')!.hasBall).toBe(true);
  });

  it('passer/receiver が見つからなければスキップ', () => {
    const { pieces, snapshot } = scenario(10);
    const res = processSpecial(pieces, snapshot, { passerId: 'nope', receiverId: 'hr' });
    expect(res.events).toHaveLength(0);
  });

  it('確定オフサイド: OFFSIDE + 守備GKへボール、受け手はボールを失う', () => {
    const { pieces, snapshot } = scenario(30); // ライン(20)を大きく超える
    const res = processSpecial(pieces, snapshot, { passerId: 'hp', receiverId: 'hr' });

    const os = eventsOfType<OffsideEvent>(res.events, 'OFFSIDE');
    expect(os).toHaveLength(1);
    expect(os[0].receiverId).toBe('hr');
    expect(os[0].source).toBe('pass');

    expect(res.pieces.find(x => x.id === 'hr')!.hasBall).toBe(false);
    expect(res.pieces.find(x => x.id === 'agk')!.hasBall).toBe(true);
    expect(eventsOfType<BallAcquiredEvent>(res.events, 'BALL_ACQUIRED').some(e => e.pieceId === 'agk')).toBe(true);
  });

  it('確定オンサイド: OFFSIDEなし・受け手はボール保持', () => {
    const { pieces, snapshot } = scenario(10); // ライン(20)より手前
    const res = processSpecial(pieces, snapshot, { passerId: 'hp', receiverId: 'hr' });

    expect(eventsOfType<OffsideEvent>(res.events, 'OFFSIDE')).toHaveLength(0);
    expect(res.pieces.find(x => x.id === 'hr')!.hasBall).toBe(true);
  });

  it('source は deliveredPass.kind を引き継ぐ（throughPass）', () => {
    const { pieces, snapshot } = scenario(30);
    const res = processSpecial(pieces, snapshot, { passerId: 'hp', receiverId: 'hr', kind: 'throughPass' });
    const os = eventsOfType<OffsideEvent>(res.events, 'OFFSIDE');
    expect(os[0].source).toBe('throughPass');
  });
});
