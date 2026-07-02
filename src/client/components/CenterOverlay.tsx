// ============================================================
// CenterOverlay.tsx — イベントカットイン（斜め帯ワイプ）
// TACKLE!/GOAL!!等のイベント演出を、goalkick演出（fcms-wipe）と同じ
// 「画面中央を横切る斜め帯」の視覚言語で統一表示する。
// showOverlay() のキュー処理・duration引数・pointerEvents:none は従来互換。
// 帯の色は OverlayItem.color（イベント種別）をグラデーションに反映する。
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CUTIN_IN_MS, CUTIN_OUT_MS } from '../pages/Battle/battleUtils';

export interface OverlayItem {
  id: string;
  text: string;
  subText?: string;
  duration: number;
  color?: string;
  fontSize?: number;
  glow?: boolean;
}

interface CenterOverlayProps {
  queue: OverlayItem[];
  onComplete: (id: string) => void;
}

const reducedMotion =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** #rgb / #rrggbb をアルファ付きrgbaへ（hex以外はそのまま返す） */
function withAlpha(color: string, alpha: number): string {
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  const m6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  const rgb = m3 ? [m3[1] + m3[1], m3[2] + m3[2], m3[3] + m3[3]] : m6 ? [m6[1], m6[2], m6[3]] : null;
  if (!rgb) return color;
  const [r, g, b] = rgb.map(h => parseInt(h, 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 帯の入り開始からテキストが遅れて入るディレイ */
const TEXT_DELAY_MS = 80;

export default function CenterOverlay({ queue, onComplete }: CenterOverlayProps) {
  const [current, setCurrent] = useState<OverlayItem | null>(null);
  const [phase, setPhase] = useState<'in' | 'show' | 'out'>('in');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef(false);

  const processNext = useCallback(() => {
    if (queue.length === 0 || processingRef.current) {
      if (queue.length === 0) { setCurrent(null); processingRef.current = false; }
      return;
    }
    processingRef.current = true;
    const item = queue[0];
    setCurrent(item);
    setPhase('in');

    // 帯オフスクリーンの初期状態を描画してから 'show' へ → CSS transitionでワイプイン
    timerRef.current = setTimeout(() => {
      setPhase('show');
      timerRef.current = setTimeout(() => {
        setPhase('out');
        timerRef.current = setTimeout(() => {
          setCurrent(null);
          processingRef.current = false;
          onComplete(item.id);
        }, CUTIN_OUT_MS);
      }, CUTIN_IN_MS + item.duration); // ワイプイン + ホールド(duration)
    }, 30);
  }, [queue, onComplete]);

  useEffect(() => {
    if (!processingRef.current && queue.length > 0) {
      processNext();
    }
  }, [queue, processNext]);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  if (!current) return null;

  const fontSize = current.fontSize ?? 36;
  const color = current.color ?? '#ffffff';

  // 帯: in=左外 → show=中央 → out=右外（reduced-motion時はワイプせずフェード）
  const bandX = phase === 'show' ? '0%' : phase === 'in' ? '-105%' : '105%';
  const moveDur = phase === 'out' ? CUTIN_OUT_MS : CUTIN_IN_MS;
  const moveEase = phase === 'out' ? 'cubic-bezier(0.7,0,0.84,0)' : 'cubic-bezier(0.16,1,0.3,1)';

  // テキスト: 帯より一拍遅れてスライドイン、抜けは帯と一緒
  const textVisible = phase === 'show';

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 270, pointerEvents: 'none', overflow: 'hidden',
    }}>
      <div style={{
        position: 'relative', width: '100%',
        minHeight: 84, padding: '14px 0',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        transform: reducedMotion ? 'none' : `translateX(${bandX})`,
        opacity: reducedMotion ? (textVisible ? 1 : 0) : (phase === 'out' ? 0 : 1),
        transition: reducedMotion
          ? `opacity ${moveDur}ms ease-out`
          : `transform ${moveDur}ms ${moveEase}, opacity ${moveDur}ms ease-out`,
      }}>
        {/* 帯背景: 暗めの斜めグラデーション + イベント色のティント */}
        <div style={{
          position: 'absolute', inset: 0,
          background: [
            `linear-gradient(105deg, ${withAlpha(color, 0)} 0%, ${withAlpha(color, 0.32)} 18%, ${withAlpha(color, 0.32)} 82%, ${withAlpha(color, 0)} 100%)`,
            'linear-gradient(105deg, rgba(8,10,18,0) 0%, rgba(8,10,18,0.82) 12%, rgba(8,10,18,0.82) 88%, rgba(8,10,18,0) 100%)',
          ].join(', '),
          boxShadow: `0 0 32px ${withAlpha(color, 0.25)}`,
        }} />
        {/* テキスト */}
        <div style={{
          position: 'relative', textAlign: 'center',
          opacity: textVisible ? 1 : 0,
          transform: reducedMotion || textVisible ? 'translateX(0)' : 'translateX(-24px)',
          transition: `opacity ${CUTIN_IN_MS}ms ease-out, transform ${CUTIN_IN_MS}ms ${moveEase}`,
          transitionDelay: textVisible ? `${TEXT_DELAY_MS}ms` : '0ms',
        }}>
          <div style={{
            fontSize, fontWeight: 900, color: '#fff', letterSpacing: 3, lineHeight: 1.1,
            textShadow: current.glow
              ? `0 0 20px ${withAlpha(color, 0.55)}, 0 2px 8px rgba(0,0,0,0.6)`
              : '0 2px 8px rgba(0,0,0,0.6)',
          }}>
            {current.text}
          </div>
          {current.subText && (
            <div style={{
              fontSize: Math.round(fontSize * 0.55), color: '#e2e8f0',
              marginTop: 6, fontWeight: 600, whiteSpace: 'pre-line',
              textShadow: '0 1px 6px rgba(0,0,0,0.6)',
            }}>
              {current.subText}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
