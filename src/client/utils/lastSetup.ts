// ============================================================
// lastSetup.ts — 前回の対戦設定の永続化（速い層 §1.3）
// モード・難易度・編成を localStorage に記憶し、
// タイトルの「前回の編成で対戦」でワンタップ復元する。
// ============================================================

import type { GameMode, ComDifficulty, FormationData } from '../types';

export interface LastSetup {
  gameMode: GameMode;
  comDifficulty: ComDifficulty;
  formationData: FormationData | null;
}

const STORAGE_KEY = 'fcms_last_setup';

export function loadLastSetup(): LastSetup | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.gameMode !== 'string') return null;
    return {
      gameMode: parsed.gameMode,
      comDifficulty: parsed.comDifficulty ?? 'regular',
      formationData: parsed.formationData ?? null,
    };
  } catch {
    return null;
  }
}

export function saveLastSetup(setup: LastSetup): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
  } catch { /* ignore */ }
}

const MODE_LABELS: Record<GameMode, string> = {
  ranked: 'ランクマッチ',
  casual: 'カジュアル',
  com: 'COM対戦',
  comVsCom: 'COM観戦',
};

const DIFFICULTY_LABELS: Record<ComDifficulty, string> = {
  beginner: 'ビギナー',
  regular: 'レギュラー',
  maniac: 'マニアック',
};

/** 「前回の編成で対戦」ボタンのサブラベル（例: "COM対戦 · レギュラー"） */
export function describeLastSetup(setup: LastSetup): string {
  const parts: string[] = [MODE_LABELS[setup.gameMode]];
  if (setup.gameMode === 'com' || setup.gameMode === 'comVsCom') {
    parts.push(DIFFICULTY_LABELS[setup.comDifficulty]);
  }
  return parts.join(' · ');
}
