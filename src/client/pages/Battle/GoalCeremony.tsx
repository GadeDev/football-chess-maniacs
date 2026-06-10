// ============================================================
// GoalCeremony.tsx — リッチGOAL演出
// チームカラー別カットイン（集中線 / カラーバンド / GOOAL!スラム /
// フラッシュ / 紙吹雪 / スコアバウンド）。
// ceremony === 'goal' の間だけマウントされる前提（マウント=演出開始）。
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Team } from '../../types';
import { GOAL_CEREMONY_MS } from './battleUtils';

// ── 演出タイミング ──
/** タメ: 暗転のみで静止する時間。この後に着弾（フラッシュ/スラム）が来る */
const TAME_MS = 320;
/** 退場: 演出終了のこの時間前から文字・帯が抜けていく */
const EXIT_MS = 220;

interface GoalCeremonyProps {
  scorerTeam: Team;
  scoreHome: number;
  scoreAway: number;
}

interface TeamPalette {
  main: string;
  hi: string;
  bandA: string;
  confetti: string[];
}

const PALETTES: Record<Team, TeamPalette> = {
  home: { main: '#2e7dff', hi: '#9cc4ff', bandA: '#143a8a', confetti: ['#2e7dff', '#9cc4ff', '#ffffff', '#ffd24a'] },
  away: { main: '#ff3d3d', hi: '#ffb3a6', bandA: '#7e1410', confetti: ['#ff3d3d', '#ffb3a6', '#ffffff', '#ffd24a'] },
};

const INK = '#06090c';
const reducedMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── 集中線（SVGポリゴン）を生成 ──
function buildSpeedlines(): string {
  let d = '';
  const N = 64;
  for (let i = 0; i < N; i++) {
    const a = (Math.PI * 2 / N) * i + Math.random() * 0.06;
    const w = 0.01 + Math.random() * 0.03;
    const inner = 55 + Math.random() * 40;
    const x1 = Math.cos(a - w) * inner, y1 = Math.sin(a - w) * inner;
    const x2 = Math.cos(a) * 300, y2 = Math.sin(a) * 300;
    const x3 = Math.cos(a + w) * inner, y3 = Math.sin(a + w) * inner;
    const op = 0.5 + Math.random() * 0.5;
    d += `<polygon points="${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${x3.toFixed(1)},${y3.toFixed(1)}" fill="rgba(255,255,255,${op.toFixed(2)})"/>`;
  }
  return d;
}

// ── 紙吹雪（canvas パーティクル） ──
interface ConfettiPart {
  x: number; y: number; vx: number; vy: number; w: number; h: number;
  rot: number; vr: number; col: string; life: number; decay: number; flutter: number;
}

function useConfetti(canvasRef: React.RefObject<HTMLCanvasElement | null>, colors: string[]) {
  useEffect(() => {
    if (reducedMotion) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = cv.getBoundingClientRect();
    cv.width = rect.width * dpr;
    cv.height = rect.height * dpr;
    const W = cv.width, H = cv.height;

    const parts: ConfettiPart[] = [];
    const origins = [[W * 0.5, H * 0.3], [W * 0.12, H * 0.42], [W * 0.88, H * 0.42]];
    const spawn = (count: number) => {
      for (let i = 0; i < count; i++) {
        const [ox, oy] = origins[i % origins.length];
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        const sp = (7 + Math.random() * 13) * dpr;
        parts.push({
          x: ox, y: oy,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          w: (4 + Math.random() * 5) * dpr, h: (7 + Math.random() * 7) * dpr,
          rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
          col: colors[(Math.random() * colors.length) | 0],
          life: 1, decay: 0.006 + Math.random() * 0.006,
          flutter: Math.random() * Math.PI * 2,
        });
      }
    };

    let raf = 0;
    // タメ(TAME_MS)後の着弾に合わせてバースト
    const t1 = window.setTimeout(() => spawn(130), TAME_MS + 150);
    const t2 = window.setTimeout(() => spawn(70), TAME_MS + 750);

    const g = 0.22 * dpr;
    const step = () => {
      ctx.clearRect(0, 0, W, H);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        p.vy += g; p.vx *= 0.985; p.vy *= 0.992;
        p.flutter += 0.18;
        p.x += p.vx + Math.sin(p.flutter) * 1.1 * dpr;
        p.y += p.vy;
        p.rot += p.vr; p.life -= p.decay;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4));
        ctx.fillStyle = p.col;
        ctx.scale(1, Math.abs(Math.sin(p.flutter * 0.7)) * 0.8 + 0.2);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ctx.clearRect(0, 0, W, H);
    };
  }, [canvasRef, colors]);
}

export default function GoalCeremony({ scorerTeam, scoreHome, scoreAway }: GoalCeremonyProps) {
  const palette = PALETTES[scorerTeam];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speedlines = useMemo(() => buildSpeedlines(), []);
  useConfetti(canvasRef, palette.confetti);

  // 退場フェーズ: 終了EXIT_MS前から文字・帯がフレームアウト
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    if (reducedMotion) return;
    const t = window.setTimeout(() => setExiting(true), Math.max(0, GOAL_CEREMONY_MS - EXIT_MS));
    return () => window.clearTimeout(t);
  }, []);

  const homeLit = scorerTeam === 'home';
  const tame = (extra: number) => `${TAME_MS + extra}ms`;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 220, pointerEvents: 'none', overflow: 'hidden' }}>
      <style>{`
        @keyframes gc-dim-in { from { opacity:0; } to { opacity:1; } }
        @keyframes gc-flash { 0% { opacity:0; } 8% { opacity:.95; } 30% { opacity:.5; } 100% { opacity:0; } }
        @keyframes gc-sl-spin { to { transform:translate(-50%,-50%) rotate(360deg); } }
        @keyframes gc-sl-in { from { opacity:0; } to { opacity:.9; } }
        @keyframes gc-band-in { 0% { transform:skewY(-6deg) scaleX(0); } 100% { transform:skewY(-6deg) scaleX(1); } }
        @keyframes gc-word-slam { 0% { transform:scale(4) rotate(-7deg); opacity:0; } 55% { transform:scale(.92) rotate(-4deg); opacity:1; } 75% { transform:scale(1.06) rotate(-5deg); } 100% { transform:scale(1) rotate(-5deg); opacity:1; } }
        @keyframes gc-sub-in { from { opacity:0; transform:translate(-50%,0) translateY(8px); letter-spacing:.7em; } to { opacity:1; transform:translate(-50%,0); letter-spacing:.45em; } }
        @keyframes gc-score-bump { 0% { transform:scale(1); } 30% { transform:scale(2); filter:drop-shadow(0 0 14px currentColor); } 100% { transform:scale(1); } }
        @keyframes gc-word-out { to { transform:scale(1.4) rotate(-5deg) translateX(60%); opacity:0; } }
        @keyframes gc-band-out { to { transform:skewY(-6deg) scaleX(0); opacity:0; } }
        @keyframes gc-fade-out { to { opacity:0; } }
      `}</style>

      {/* dimmer（中心は抜く）: タメ=暗転フェードインで静止を作る */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 90% 55% at 50% 45%, transparent 26%, rgba(2,4,7,.82) 100%)',
        opacity: 1,
        animation: reducedMotion ? 'none'
          : exiting ? `gc-fade-out ${EXIT_MS}ms ease-in both`
          : 'gc-dim-in .3s ease-out both',
      }} />

      {/* flash: タメ後の「着弾」 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: palette.hi,
        opacity: 0,
        animation: reducedMotion ? 'none' : `gc-flash .55s ease-out ${tame(0)} both`,
      }} />

      {/* 紙吹雪 */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />

      {/* 集中線 */}
      <svg
        viewBox="-200 -200 400 400"
        dangerouslySetInnerHTML={{ __html: speedlines }}
        style={{
          position: 'absolute', left: '50%', top: '45%',
          width: '200vmax', height: '200vmax',
          transform: 'translate(-50%,-50%)',
          opacity: reducedMotion ? 0.35 : undefined,
          animation: reducedMotion ? 'none'
            : exiting ? `gc-sl-spin 7s linear infinite, gc-fade-out ${EXIT_MS}ms ease-in both`
            : `gc-sl-spin 7s linear infinite, gc-sl-in .25s ease-out ${tame(0)} both`,
        }}
      />

      {/* カラーバンド */}
      <div style={{
        position: 'absolute', left: '-10%', right: '-10%', top: '38%', height: '24%',
        background: `linear-gradient(100deg, transparent 0%, ${palette.bandA} 12%, ${palette.main} 50%, ${palette.bandA} 88%, transparent 100%)`,
        boxShadow: `0 0 60px ${palette.main}aa`,
        transform: 'skewY(-6deg) scaleX(1)',
        transformOrigin: 'center',
        animation: reducedMotion ? 'none'
          : exiting ? `gc-band-out ${EXIT_MS}ms ease-in both`
          : `gc-band-in .28s cubic-bezier(.2,.9,.2,1) ${tame(0)} both`,
      }} />

      {/* GOOAL! */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
        textAlign: 'center', width: '100%',
      }}>
        <div style={{
          fontFamily: "'Arial Black','Hiragino Sans W8',sans-serif",
          fontStyle: 'italic', fontWeight: 900,
          fontSize: 'clamp(56px,17vw,96px)', letterSpacing: '.01em', color: '#fff',
          WebkitTextStroke: `2.5px ${INK}`,
          textShadow: `0 0 26px ${palette.hi}, 4px 4px 0 ${INK}, 8px 8px 0 rgba(0,0,0,.35)`,
          animation: reducedMotion ? 'none'
            : exiting ? `gc-word-out ${EXIT_MS}ms ease-in both`
            : `gc-word-slam .42s cubic-bezier(.15,1.6,.3,1) ${tame(70)} both`,
          transform: reducedMotion ? 'rotate(-5deg)' : undefined,
        }}>
          GOOAL!
        </div>
      </div>

      {/* sub: スコア */}
      <div style={{
        position: 'absolute', left: '50%', top: '63%', transform: 'translate(-50%,0)',
        display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'center',
        fontVariantNumeric: 'tabular-nums',
        animation: reducedMotion ? 'none'
          : exiting ? `gc-fade-out ${EXIT_MS}ms ease-in both`
          : `gc-sub-in .3s ease-out ${tame(300)} both`,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.18em', color: PALETTES.home.hi }}>HOME</span>
        <span style={{
          fontSize: 32, fontWeight: 900, lineHeight: 1,
          fontFamily: "'Arial Black','Hiragino Sans W8',sans-serif",
          color: homeLit ? PALETTES.home.hi : '#dfe7ee', display: 'inline-block',
          animation: (!reducedMotion && homeLit && !exiting) ? `gc-score-bump .7s cubic-bezier(.2,2.4,.4,1) ${tame(350)}` : 'none',
        }}>{scoreHome}</span>
        <span style={{ color: '#3c4a55', fontSize: 22, fontWeight: 700 }}>–</span>
        <span style={{
          fontSize: 32, fontWeight: 900, lineHeight: 1,
          fontFamily: "'Arial Black','Hiragino Sans W8',sans-serif",
          color: !homeLit ? PALETTES.away.hi : '#dfe7ee', display: 'inline-block',
          animation: (!reducedMotion && !homeLit && !exiting) ? `gc-score-bump .7s cubic-bezier(.2,2.4,.4,1) ${tame(350)}` : 'none',
        }}>{scoreAway}</span>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.18em', color: PALETTES.away.hi }}>AWAY</span>
      </div>
    </div>
  );
}
