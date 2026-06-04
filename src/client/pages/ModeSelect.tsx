// ============================================================
// ModeSelect.tsx — 対戦セットアップ
// モード選択 + COM時の難易度をこの1画面に集約（旧 DifficultySelect 統合）。
// 「編成して開始」/「この設定で開始」で次の導線を分岐。
// ============================================================

import React, { useState } from 'react';
import type { GameMode, ComDifficulty } from '../types';

interface ModeSelectProps {
  /** 初期選択モード（前回設定の復元用） */
  initialMode?: GameMode;
  /** 初期選択難易度（前回設定の復元用） */
  initialDifficulty?: ComDifficulty;
  /** 「編成して開始」: 編成画面へ */
  onStartWithFormation: (mode: GameMode, difficulty: ComDifficulty) => void;
  /** 「この設定で開始」/「観戦を開始」: マッチングへ直行 */
  onStartNow: (mode: GameMode, difficulty: ComDifficulty) => void;
  onBack: () => void;
}

const MODES: { id: GameMode; label: string; desc: string }[] = [
  { id: 'ranked', label: 'ランクマッチ', desc: 'レーティングに基づく真剣勝負' },
  { id: 'casual', label: 'カジュアル', desc: 'レーティング変動なしのフリー対戦' },
  { id: 'com', label: 'COM対戦', desc: 'AIと練習試合' },
  { id: 'comVsCom', label: 'COM観戦', desc: 'AI同士の試合を観戦' },
];

const DIFFICULTIES: { id: ComDifficulty; label: string; icon: string; color: string }[] = [
  { id: 'beginner', label: 'ビギナー', icon: '\u{1F7E2}', color: '#44aa44' },
  { id: 'regular', label: 'レギュラー', icon: '\u{1F7E1}', color: '#cc8800' },
  { id: 'maniac', label: 'マニアック', icon: '\u{1F534}', color: '#cc4444' },
];

export default function ModeSelect({
  initialMode = 'com',
  initialDifficulty = 'regular',
  onStartWithFormation,
  onStartNow,
  onBack,
}: ModeSelectProps) {
  const [mode, setMode] = useState<GameMode>(initialMode);
  const [difficulty, setDifficulty] = useState<ComDifficulty>(initialDifficulty);

  const isCom = mode === 'com' || mode === 'comVsCom';
  const isSpectate = mode === 'comVsCom';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 20,
        padding: 20,
      }}
    >
      <h2 style={{ fontSize: 22, fontWeight: 'bold' }}>対戦セットアップ</h2>

      {/* モード選択 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 360 }}>
        {MODES.map((m) => {
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                padding: '14px 20px',
                borderRadius: 12,
                border: active ? '2px solid #ffd700' : '1px solid rgba(255,255,255,0.1)',
                background: active ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.05)',
                color: '#fff',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 'bold' }}>{m.label}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{m.desc}</div>
            </button>
          );
        })}
      </div>

      {/* 難易度（COM系のみ） */}
      {isCom && (
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div style={{ fontSize: 13, color: '#aaa', marginBottom: 8 }}>COM難易度</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {DIFFICULTIES.map((d) => {
              const active = difficulty === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => setDifficulty(d.id)}
                  style={{
                    flex: 1,
                    padding: '10px 6px',
                    borderRadius: 10,
                    border: active ? `2px solid ${d.color}` : '1px solid rgba(255,255,255,0.12)',
                    background: active ? `${d.color}22` : 'rgba(255,255,255,0.04)',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: active ? 'bold' : 'normal',
                  }}
                >
                  <span style={{ marginRight: 4 }}>{d.icon}</span>{d.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 開始ボタン */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8, width: '100%', maxWidth: 360 }}>
        {!isSpectate && (
          <button
            onClick={() => onStartWithFormation(mode, difficulty)}
            style={{
              flex: 1,
              padding: '14px 0',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.06)',
              color: '#fff',
              fontSize: 15,
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            編成して開始
          </button>
        )}
        <button
          onClick={() => onStartNow(mode, difficulty)}
          style={{
            flex: 1,
            padding: '14px 0',
            borderRadius: 10,
            border: 'none',
            background: 'linear-gradient(135deg, #2a6a2a, #3a8a3a)',
            color: '#fff',
            fontSize: 15,
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          {isSpectate ? '観戦を開始' : 'この設定で開始'}
        </button>
      </div>

      <button
        onClick={onBack}
        style={{
          marginTop: 8,
          padding: '8px 24px',
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 8,
          color: '#888',
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        戻る
      </button>
    </div>
  );
}
