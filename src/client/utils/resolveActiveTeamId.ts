// ============================================================
// resolveActiveTeamId.ts — マッチング/フレンド対戦に渡す編成teamIdを解決
// ============================================================

import { fcmsFetch } from '../platform/authClient';

/**
 * is_active なチーム → 無ければ先頭 → 無ければ 'default'（サーバーは固定4-4-2にフォールバック）。
 */
export async function resolveActiveTeamId(): Promise<string> {
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
