// ============================================================
// resolveActiveTeamId.ts — マッチング/フレンド対戦に渡す編成teamIdを解決
// ============================================================

import { loadDraft } from './formationServer';
import { MATCH_LINEUP_PREFIX } from '../../lib/matchLineup';
import { fcmsFetch } from '../platform/authClient';

/**
 * 現在の編成を対戦専用のスナップショットとして送る。未編成なら保存済み → default。
 */
export async function resolveActiveTeamId(): Promise<string> {
  const draft = loadDraft();
  if (draft?.starters.length === 11) return MATCH_LINEUP_PREFIX + JSON.stringify({ starters: draft.starters, bench: draft.bench });
  try {
    const res = await fcmsFetch('/api/teams');
    if (!res.ok) return 'default';
    const data = (await res.json()) as { teams?: Array<{ id: string; is_active?: boolean }> };
    const teams = data.teams ?? [];
    return (teams.find(t => t.is_active) ?? teams[0])?.id ?? 'default';
  } catch {
    return 'default';
  }
}
