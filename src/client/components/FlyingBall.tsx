// ============================================================
// FlyingBall.tsx — ボール飛行アニメーション
// パス/シュート時にピッチ上をボールが飛ぶ演出
// useRef + 直接DOM操作でCSS transitionを確実にトリガー
// ============================================================

import React, { useEffect, useRef } from 'react';

const reducedMotion =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface FlyingBallData {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  type: 'pass' | 'throughPass' | 'shoot' | 'dribble';
  durationMs: number;
}

interface FlyingBallProps {
  data: FlyingBallData | null;
  onComplete: () => void;
}

const SZ = 24;
const HALF = SZ / 2;

export default function FlyingBall({ data, onComplete }: FlyingBallProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el || !data) return;

    // 1. 初期位置にジャンプ（transitionなし）
    el.style.transition = 'none';
    el.style.left = `${data.fromX - HALF}px`;
    el.style.top = `${data.fromY - HALF}px`;
    el.style.transform = 'rotate(0deg)';
    el.style.opacity = '1';
    // reflow を強制して初期位置を確定させる
    el.getBoundingClientRect();

    // 2. 次フレームでtransitionを有効にして目的地へ移動
    requestAnimationFrame(() => {
      el.style.transition = `left ${data.durationMs}ms ease-out, top ${data.durationMs}ms ease-out, transform ${data.durationMs}ms linear`;
      el.style.left = `${data.toX - HALF}px`;
      el.style.top = `${data.toY - HALF}px`;
      el.style.transform = 'rotate(720deg)';
    });

    // 3. 到着後にonComplete
    timerRef.current = setTimeout(() => {
      onComplete();
    }, data.durationMs + 30);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [data, onComplete]);

  if (!data) return null;

  const glowColor = data.type === 'shoot' ? 'rgba(255,50,50,0.6)'
    : data.type === 'throughPass' ? 'rgba(0,210,210,0.6)'
    : 'rgba(60,140,255,0.6)';

  // ── C1: 進行方向の光の尾（シュートは長く太く、パスは控えめ、ドリブルはなし）──
  const angleDeg = Math.atan2(data.toY - data.fromY, data.toX - data.fromX) * 180 / Math.PI;
  const trail = reducedMotion ? null : data.type === 'shoot'
    ? { length: 42, thickness: 5 }
    : data.type === 'throughPass'
    ? { length: 30, thickness: 4 }
    : data.type === 'pass'
    ? { length: 22, thickness: 3 }
    : null; // dribble は地上を転がるため軌跡なし

  // ── C2: スルーパス（ロブ系）はふわっと山なりの弧を描く ──
  const isLobbed = !reducedMotion && data.type === 'throughPass';

  return (
    <div
      ref={elRef}
      style={{
        position: 'absolute',
        width: SZ,
        height: SZ,
        zIndex: 260,
        pointerEvents: 'none',
        filter: `drop-shadow(0 0 12px ${glowColor})`,
      }}
    >
      <style>{`
        @keyframes fcms-ball-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes fcms-ball-arc{0%{transform:translateY(0)}50%{transform:translateY(-22px)}100%{transform:translateY(0)}}
      `}</style>
      {trail && (
        <div
          style={{
            position: 'absolute',
            left: HALF,
            top: HALF - trail.thickness / 2,
            width: trail.length,
            height: trail.thickness,
            transformOrigin: '0 50%',
            transform: `rotate(${angleDeg + 180}deg)`,
            background: `linear-gradient(to right, ${glowColor}, transparent)`,
            borderRadius: trail.thickness / 2,
          }}
        />
      )}
      <div
        style={isLobbed ? { animation: `fcms-ball-arc ${data.durationMs}ms ease-in-out 1` } : undefined}
      >
        <svg width={SZ} height={SZ} viewBox={`0 0 ${SZ} ${SZ}`} style={{ animation: 'fcms-ball-spin 0.5s linear infinite' }}>
          <circle cx={HALF} cy={HALF} r={HALF - 1} fill="white" stroke="#333" strokeWidth={1} />
          {Array.from({ length: 5 }, (_, i) => {
            const a = ((i * 72 - 90) * Math.PI) / 180;
            return <circle key={i} cx={HALF + 6 * Math.cos(a)} cy={HALF + 6 * Math.sin(a)} r={2} fill="#333" />;
          })}
        </svg>
      </div>
    </div>
  );
}
