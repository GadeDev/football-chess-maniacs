// ============================================================
// PKGame.tsx — PKミニゲーム（§4-3）
// ゴール6ゾーン選択。PK戦時はキッカー選択 + 蹴り順UI。
// ============================================================

import React, { useState, useCallback, useEffect } from 'react';
import type { PieceData } from '../../types';
import { POSITION_COLORS } from '../../types';
import { t, tn } from '../../i18n';
import { GkSprite, KickerSprite } from './KickScene';

interface PKGameProps {
  isKicker: boolean;
  isMobile: boolean;
  onSubmit: (zone: number) => void;
  countdown: number;
  kickerInfo: { position: string; cost: number };
  gkInfo: { position: string; cost: number };
  /** PK戦モード */
  isPKShootout?: boolean;
  /** PK戦のスコア */
  shootoutScore?: { home: number; away: number };
  /** 現在の蹴り番号（1-5+） */
  shootoutRound?: number;
}

const ZONES = [
  { labelKey: 'course.top_left', row: 0, col: 0 },
  { labelKey: 'course.top_center', row: 0, col: 1 },
  { labelKey: 'course.top_right', row: 0, col: 2 },
  { labelKey: 'course.bottom_left', row: 1, col: 0 },
  { labelKey: 'course.bottom_center', row: 1, col: 1 },
  { labelKey: 'course.bottom_right', row: 1, col: 2 },
];

export default function PKGame({
  isKicker,
  isMobile,
  onSubmit,
  countdown,
  kickerInfo,
  gkInfo,
  isPKShootout = false,
  shootoutScore,
  shootoutRound,
}: PKGameProps) {
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // PCキーボード操作（§4-3: テンキー）
  useEffect(() => {
    if (isMobile || submitted) return;
    const numMap: Record<string, number> = { '7': 0, '8': 1, '9': 2, '4': 3, '5': 4, '6': 5 };
    const handleKey = (e: KeyboardEvent) => {
      const zone = numMap[e.key];
      if (zone !== undefined) setSelectedZone(zone);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isMobile, submitted]);

  const handleSubmit = useCallback(() => {
    if (selectedZone === null || submitted) return;
    setSubmitted(true);
    onSubmit(selectedZone);
  }, [selectedZone, submitted, onSubmit]);

  // カウントダウン0で自動送信（未選択なら中央下）
  useEffect(() => {
    if (countdown <= 0 && !submitted) {
      const zone = selectedZone ?? 4;
      setSubmitted(true);
      onSubmit(zone);
    }
  }, [countdown, submitted, selectedZone, onSubmit]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 16,
      padding: 20,
    }}>
      {/* PK戦スコア */}
      {isPKShootout && shootoutScore && (
        <div style={{ fontSize: 18, fontWeight: 'bold' }}>
          {tn('pk.shootout_round', shootoutRound ?? 0)} — {shootoutScore.home} - {shootoutScore.away}
        </div>
      )}

      <div style={{ fontSize: 24, fontWeight: 'bold', color: countdown <= 2 ? '#ff4444' : '#fff' }}>
        {isKicker ? t('pk.title_kick') : t('pk.title_save')} - {tn('pk.countdown', countdown)}
      </div>

      {/* 操作説明 */}
      <div style={{ fontSize: 15, color: '#ffd700', textAlign: 'center' }}>
        {isKicker
          ? t('pk.guide_kick')
          : t('pk.guide_save')}
      </div>

      {/* キッカー/GK情報 */}
      <div style={{ display: 'flex', gap: 20, fontSize: 14 }}>
        <span>{t('pk.kicker_info', { position: kickerInfo.position, cost: kickerInfo.cost })}</span>
        <span>{t('pk.gk_info', { position: gkInfo.position, cost: gkInfo.cost })}</span>
      </div>

      {/* 対峙シーン: ゴールマウスのGK */}
      <GkSprite submitted={submitted} height={isMobile ? 56 : 68} />

      {/* ゴール6ゾーン */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6,
          width: isMobile ? 300 : 360,
          aspectRatio: '3/2',
          background: 'rgba(255,255,255,0.03)',
          border: '3px solid rgba(255,255,255,0.3)',
          borderRadius: 8,
          padding: 6,
        }}
      >
        {ZONES.map((zone, i) => (
          <button
            key={i}
            onClick={() => !submitted && setSelectedZone(i)}
            style={{
              border: selectedZone === i ? '3px solid #ffd700' : '1px solid rgba(255,255,255,0.15)',
              borderRadius: 8,
              background: selectedZone === i
                ? isKicker ? 'rgba(255,60,60,0.2)' : 'rgba(60,140,255,0.2)'
                : 'rgba(255,255,255,0.03)',
              color: '#fff',
              fontSize: isMobile ? 18 : 16,
              fontWeight: selectedZone === i ? 'bold' : 'normal',
              cursor: submitted ? 'default' : 'pointer',
              transition: 'all 0.1s',
            }}
          >
            {t(zone.labelKey)}
          </button>
        ))}
      </div>

      {/* 対峙シーン: 助走位置のキッカー（後ろ姿） */}
      <KickerSprite submitted={submitted} height={isMobile ? 72 : 88} />

      <button
        onClick={handleSubmit}
        disabled={selectedZone === null || submitted}
        style={{
          padding: '12px 40px',
          borderRadius: 10,
          border: 'none',
          background: submitted ? '#666' : selectedZone !== null ? '#44aa44' : '#333',
          color: '#fff',
          fontSize: 16,
          fontWeight: 'bold',
          cursor: submitted || selectedZone === null ? 'default' : 'pointer',
        }}
      >
        {submitted ? t('pk.waiting') : t('pk.confirm')}
      </button>
    </div>
  );
}

// ── PK戦キッカー選択UI（§4-3） ──

interface PKKickerSelectProps {
  pieces: PieceData[];
  onSubmit: (kickerOrder: string[]) => void;
  isMobile: boolean;
}

export function PKKickerSelect({ pieces, onSubmit, isMobile }: PKKickerSelectProps) {
  const [kickerOrder, setKickerOrder] = useState<string[]>([]);

  const handleToggle = useCallback((pieceId: string) => {
    setKickerOrder((prev) => {
      if (prev.includes(pieceId)) return prev.filter((id) => id !== pieceId);
      if (prev.length >= 5) return prev;
      return [...prev, pieceId];
    });
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: 20 }}>
      <div style={{ fontSize: 20, fontWeight: 'bold' }}>{t('pk.kicker_select_title')}</div>

      {/* 蹴り順スロット */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {Array.from({ length: 5 }, (_, i) => {
          const piece = pieces.find((p) => p.id === kickerOrder[i]);
          return (
            <div
              key={i}
              style={{
                width: 56,
                height: 56,
                borderRadius: 8,
                border: '2px dashed rgba(255,255,255,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: piece ? 'rgba(255,215,0,0.1)' : 'transparent',
                fontSize: 12,
              }}
            >
              {piece ? (
                <span style={{ color: POSITION_COLORS[piece.position] }}>
                  {piece.position}<br />★{piece.cost}
                </span>
              ) : (
                <span style={{ color: '#555' }}>{i + 1}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* コマ一覧 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 400 }}>
        {pieces.map((piece) => {
          const idx = kickerOrder.indexOf(piece.id);
          const isSelected = idx !== -1;
          return (
            <button
              key={piece.id}
              onClick={() => handleToggle(piece.id)}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: isSelected ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.2)',
                background: isSelected ? 'rgba(255,215,0,0.1)' : 'transparent',
                color: '#fff',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {isSelected && <span style={{ marginRight: 4 }}>#{idx + 1}</span>}
              <span style={{ color: POSITION_COLORS[piece.position] }}>{piece.position}</span> ★{piece.cost}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => kickerOrder.length === 5 && onSubmit(kickerOrder)}
        disabled={kickerOrder.length < 5}
        style={{
          padding: '12px 40px',
          borderRadius: 10,
          border: 'none',
          background: kickerOrder.length === 5 ? '#44aa44' : '#333',
          color: '#fff',
          fontSize: 16,
          fontWeight: 'bold',
          cursor: kickerOrder.length === 5 ? 'pointer' : 'default',
        }}
      >
        {tn('pk.confirm_count', kickerOrder.length)}
      </button>
    </div>
  );
}
