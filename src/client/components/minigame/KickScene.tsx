// ============================================================
// KickScene.tsx — PK/FKミニゲームの対峙シーン（キャラクタースプライト）
// public/assets/characters/ のvoxel調スプライトを表示する。
// 確定（submitted）でGK=横っ飛び / キッカー=キックモーションに切り替わる。
// ============================================================

import React from 'react';

const BASE = '/assets/characters';

/** ゴール（ゾーングリッド）の前に立つGK。submitted=trueで横っ飛び */
export function GkSprite({ submitted, height = 64 }: { submitted: boolean; height?: number }) {
  return (
    <img
      src={`${BASE}/${submitted ? 'gk_dive_side' : 'gk_ready'}.png`}
      alt=""
      draggable={false}
      style={{
        height,
        // グリッドに少し重ねて「ゴールマウスに立っている」見た目にする
        marginBottom: -10,
        zIndex: 1,
        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.45))',
        transition: 'transform 0.18s ease-out',
        transform: submitted ? 'translateX(24%) rotate(-10deg)' : undefined,
        pointerEvents: 'none',
      }}
    />
  );
}

/** ボールを前にした後ろ姿のキッカー。submitted=trueでキックモーション */
export function KickerSprite({ submitted, height = 88 }: { submitted: boolean; height?: number }) {
  return (
    <img
      src={`${BASE}/${submitted ? 'kicker_strike' : 'kicker_ready'}.png`}
      alt=""
      draggable={false}
      style={{
        height,
        marginTop: -6,
        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.45))',
        transition: 'transform 0.18s ease-out',
        transform: submitted ? 'scale(1.06)' : undefined,
        pointerEvents: 'none',
      }}
    />
  );
}
