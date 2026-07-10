// ============================================================
// lastSetup.ts — 前回の対戦設定の永続化（速い層 §1.3）
// モード・難易度・編成・チーム識別情報を localStorage に記憶し、
// マイページ（Title.tsx）の自チームカード表示に使う。
// ============================================================

import type { GameMode, ComDifficulty, FormationData, TeamOrigin } from '../types';
import { t, type Locale } from '../i18n';
import { PRESET_TEAMS } from '../../data/presetTeams';

export interface LastSetup {
  gameMode: GameMode;
  comDifficulty: ComDifficulty;
  formationData: FormationData | null;
  /** 自チームカード表示用（formationData.teamName/teamEmoji/origin のスナップショット） */
  teamName?: string;
  teamEmoji?: string;
  origin?: TeamOrigin;
}

const STORAGE_KEY = 'fcms_last_setup';

/** チーム名の表示用フォールバック（未設定時は「マイチーム」） */
export function resolveTeamName(name?: string): string {
  return name && name.trim().length > 0 ? name : t('team.default_name');
}

/** プリセット名は永続化時の言語に焼き込まず、現在ロケールで都度解決する。 */
export function resolveLastSetupTeamName(setup: LastSetup | null | undefined, locale: Locale): string {
  if (setup?.origin === 'preset' && setup.formationData) {
    const presetId = setup.formationData.presetTeamId;
    const firstPieceId = setup.formationData.starters[0]?.id;
    const preset = PRESET_TEAMS.find((team) =>
      team.id === presetId || firstPieceId?.startsWith(`preset-${team.id}-`),
    );
    if (preset) return locale === 'ja' ? preset.name : preset.nameEn;
  }
  return resolveTeamName(setup?.teamName);
}

const DEFAULT_TEAM_EMOJI = '⚽';

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
      teamName: parsed.teamName ?? parsed.formationData?.teamName,
      teamEmoji: parsed.teamEmoji ?? parsed.formationData?.teamEmoji ?? DEFAULT_TEAM_EMOJI,
      origin: parsed.origin ?? parsed.formationData?.origin ?? 'custom',
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
