/**
 * PieceIcon.tsx — Football Chess ManiacS コマアイコンコンポーネント
 * PNG画像トークン + SVGオーバーレイ（選択リング、バッジ等）
 */

import { memo } from "react";
import { getPieceAssetPath } from "../../utils/pieceAssetPath";
import { t } from "../../i18n";

// ── 型定義 ──────────────────────────────────────────────
export type Position = "GK" | "DF" | "SB" | "VO" | "MF" | "OM" | "WG" | "FW";
export type Cost = 1 | 1.5 | 2 | 2.5 | 3;
export type Side = "ally" | "enemy";

/** C2: 命令済みバッジ種類 */
export type OrderBadge = 'move' | 'pass' | 'shoot' | 'throughPass' | 'stay' | null;

export interface PieceIconProps {
  cost: Cost;
  position: Position;
  side: Side;
  selected?: boolean;
  hasBall?: boolean;
  /** C2: 未命令パルスアニメーション */
  pulse?: boolean;
  /** C2: 命令済みバッジ */
  orderBadge?: OrderBadge;
  onClick?: () => void;
  /** ボールアイコンクリック（コマ本体とは別） */
  onBallClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

// ── 定数 ─────────────────────────────────────────────────
const SELECTED_RING_COLOR = "#FACC15";

/**
 * GK 識別色（2026-09-10）: 画像は他ポジションと共通のまま、円盤部分の色相だけを差し替える。
 * 味方=ティール（青とも芝の緑とも被らない）/ 敵=オレンジ（赤とも金枠とも被らない）。
 * トークン PNG の円盤は中心 (50%, 43%)・半径 30% に収まる（実測）。
 * `mix-blend-mode: hue` は覆い色の色相 + 元画像の彩度・明度なので、白い数字・銀/金の枠・灰色の札はそのまま残る。
 * ※ 画像そのものの差し替えは別途検討（オーナー判断）。
 */
const GK_TINT: Record<Side, string> = { ally: '#14b8a6', enemy: '#f97316' };
const GK_DISC = { cx: 0.5, cy: 0.43, r: 0.3 } as const;

interface CostConfig {
  rank: string;
  size: number;
}

const COST_CONFIG: Record<number, CostConfig> = {
  1:   { rank: "1",  size: 64 },
  1.5: { rank: "1+", size: 64 },
  2:   { rank: "2",  size: 64 },
  2.5: { rank: "2+", size: 64 },
  3:   { rank: "SS", size: 72 },
};

// ── コンポーネント ────────────────────────────────────────
const PieceIcon = memo(function PieceIcon({
  cost,
  position,
  side,
  selected = false,
  hasBall = false,
  pulse = false,
  orderBadge = null,
  onClick,
  onBallClick,
  className,
  style,
}: PieceIconProps) {
  const config = COST_CONFIG[cost];
  if (!config) return null;

  const { size: defaultSize } = config;

  // style で width/height が指定された場合はそれを使う（Formation等でのサイズ上書き対応）
  const renderSize = (style?.width as number) ?? (style?.height as number) ?? defaultSize;
  const svgSize = defaultSize; // SVG viewBox は常にデフォルトサイズ基準

  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const outerR = svgSize / 2 - 2;

  // ボールアイコン位置
  const ballCx = svgSize - 8;
  const ballCy = svgSize - 8;
  const pentagons = Array.from({ length: 5 }, (_, i) => {
    const a = ((i * 72 - 90) * Math.PI) / 180;
    return { x: ballCx + 5 * Math.cos(a), y: ballCy + 5 * Math.sin(a) };
  });

  const imgSrc = getPieceAssetPath(position, cost, side);

  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        position: 'relative',
        width: renderSize,
        height: renderSize,
        cursor: onClick ? "pointer" : undefined,
        isolation: 'isolate', // GK 色相オーバーレイの blend を盤面へ漏らさない
        ...style,
      }}
      role="img"
      aria-label={`${position} ${t('common.cost_compact', { cost })} ${side === "ally" ? t('piece.side_ally') : t('piece.side_enemy')}`}
    >
      {/* PNG トークン画像 */}
      <img
        src={imgSrc}
        alt=""
        draggable={false}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          pointerEvents: 'none',
        }}
      />

      {/* GK 識別色: 円盤の色相だけを差し替える（svg ルートに blend を掛けるので <img> と合成される） */}
      {position === 'GK' && (
        <>
          <svg
            data-testid="gk-tint"
            xmlns="http://www.w3.org/2000/svg"
            width="100%"
            height="100%"
            viewBox={`0 0 ${svgSize} ${svgSize}`}
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', mixBlendMode: 'hue' }}
          >
            <circle cx={svgSize * GK_DISC.cx} cy={svgSize * GK_DISC.cy} r={svgSize * GK_DISC.r} fill={GK_TINT[side]} />
          </svg>
          {side === 'enemy' && (
            /* 敵の円盤は暗い赤なので、そのまま色相を回すと茶色寄りになる。薄く明るさを足してオレンジに見せる */
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="100%"
              height="100%"
              viewBox={`0 0 ${svgSize} ${svgSize}`}
              style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', mixBlendMode: 'screen' }}
            >
              <circle cx={svgSize * GK_DISC.cx} cy={svgSize * GK_DISC.cy} r={svgSize * GK_DISC.r} fill="#ffffff" opacity={0.14} />
            </svg>
          )}
        </>
      )}

      {/* SVG オーバーレイ（選択リング、バッジ等） — viewBox で自動スケール */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="100%"
        viewBox={`0 0 ${svgSize} ${svgSize}`}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
        }}
      >
        {/* CSS animations */}
        {(selected || pulse) && (
          <style>{`
            @keyframes fcms-pulse{0%,100%{opacity:1}50%{opacity:0.35}}
            @keyframes fcms-breathe{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.08);opacity:0.85}}
          `}</style>
        )}

        {/* 選択時の黄色リング（点滅） */}
        {selected && (
          <circle
            cx={cx}
            cy={cy}
            r={outerR + 1}
            fill="none"
            stroke={SELECTED_RING_COLOR}
            strokeWidth={3}
            style={{ animation: "fcms-pulse 1s ease-in-out infinite" }}
          />
        )}

        {/* C2: 未命令パルスリング */}
        {pulse && !selected && (
          <circle
            cx={cx} cy={cy} r={outerR + 2}
            fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={1.5}
            style={{ animation: "fcms-breathe 1.5s ease-in-out infinite", transformOrigin: `${cx}px ${cy}px` }}
          />
        )}

        {/* ボール保持: 小さいインジケーター（右下） */}
        {hasBall && !onBallClick && (
          <g>
            <circle cx={ballCx} cy={ballCy} r={10} fill="white" stroke="#222" strokeWidth={0.8} />
            {pentagons.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={1.8} fill="#333" />
            ))}
          </g>
        )}

        {/* C2: 命令済みバッジ (左下) */}
        {orderBadge && !hasBall && (
          <g>
            <circle cx={8} cy={svgSize - 8} r={7} fill={
              orderBadge === 'move' ? '#44aa44'
              : orderBadge === 'pass' ? '#4488cc'
              : orderBadge === 'throughPass' ? '#00cccc'
              : orderBadge === 'shoot' ? '#cc4444'
              : '#666'
            } stroke="#111" strokeWidth={1} />
            <text x={8} y={svgSize - 5} textAnchor="middle" fill="white" fontSize={8} fontWeight={700}>
              {orderBadge === 'move' ? '\u2192'
              : orderBadge === 'pass' ? '\u26BD'
              : orderBadge === 'throughPass' ? '\u21DD'
              : orderBadge === 'shoot' ? '\u{1F945}'
              : '\u2014'}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
});

export default PieceIcon;

// ── ユーティリティ: コストからランク文字列を取得 ─────────
export function costToRank(cost: Cost): string {
  return COST_CONFIG[cost]?.rank ?? String(cost);
}

// ── ユーティリティ: コマサイズを取得 ─────────────────────
export function pieceSize(cost: Cost): number {
  return COST_CONFIG[cost]?.size ?? 64;
}
