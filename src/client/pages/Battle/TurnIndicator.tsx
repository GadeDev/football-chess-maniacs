// ============================================================
// TurnIndicator.tsx — ターン番号の控えめ表示（Phase E1）
// 旧: 毎ターンの全画面暗転 setCeremony('turn') + showOverlay('Turn N') を廃止し、
// 試合時間ラベル横で小さくフェード切替するこの1系統に統一した。
// ============================================================

import React from 'react';
import { TURN_INDICATOR_MS } from './battleUtils';
import { t } from '../../i18n';

const reducedMotion =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function TurnIndicator({ turn }: { turn: number }) {
  if (turn <= 0) return null;
  return (
    // key={turn} でターン切替時に要素を差し替え、フェードインを再生する
    <span
      key={turn}
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: '#94a3b8',
        letterSpacing: 1,
        whiteSpace: 'nowrap',
        animation: reducedMotion ? 'none' : `fcms-turn-fade ${TURN_INDICATOR_MS}ms ease-out`,
      }}
    >
      <style>{`@keyframes fcms-turn-fade { from { opacity: 0; } to { opacity: 1; } }`}</style>
      {t('battle.turn_indicator', { turn })}
    </span>
  );
}
