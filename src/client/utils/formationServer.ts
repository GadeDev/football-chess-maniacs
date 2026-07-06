// ============================================================
// formationServer.ts — 編成画面のサーバー接続層（spec v3）
// 所持コマ取得（/api/pieces）、チームCRUD（/api/teams）、
// ゲスト向けFounding Eleven解決、編成ドラフトのlocalStorage永続化。
// ============================================================

import { apiUrl } from '../types';
import { FOUNDING_ELEVEN_IDS } from '../../types/piece';

/** 編成画面が扱う所持コマ（サーバー/ゲスト共通の正規化形） */
export interface ServerOwnedPiece {
  pieceId: number;
  position: string;
  cost: number;
  nameJa: string;
  nameEn: string;
  era: number;
}

/** サーバー保存済みチーム（1スロット分） */
export interface ServerTeamSlot {
  teamId: string;
  slotNumber: number;
  name: string;
  formationPreset: string;
  fieldPieces: Array<{ piece_id: number; position: string; cost: number; col?: number; row?: number }>;
  benchPieces: Array<{ piece_id: number; position: string; cost: number }>;
  isActive: boolean;
}

export interface TeamsResponse {
  slots: ServerTeamSlot[];
  maxSlots: number;
  availableSlots: number;
}

/** 通信失敗・未ログイン時のFounding Elevenフォールバック（characters_200.csv準拠、全コスト1） */
export const FOUNDING_ELEVEN_FALLBACK: ServerOwnedPiece[] = [
  { pieceId: 8, position: 'GK', cost: 1, nameJa: 'トム・ハーディング', nameEn: 'Tom Harding', era: 1 },
  { pieceId: 9, position: 'DF', cost: 1, nameJa: 'イライジャ・マッケイ', nameEn: 'Elijah Mackay', era: 1 },
  { pieceId: 55, position: 'DF', cost: 1, nameJa: 'マリウス・ベックマン', nameEn: 'Marius Beckmann', era: 2 },
  { pieceId: 37, position: 'SB', cost: 1, nameJa: 'ヨゼフ・ハートマン', nameEn: 'Josef Hartmann', era: 2 },
  { pieceId: 70, position: 'SB', cost: 1, nameJa: 'エルネスト・リベラ', nameEn: 'Ernesto Rivera', era: 3 },
  { pieceId: 35, position: 'VO', cost: 1, nameJa: 'ルーシー・ブライス', nameEn: 'Lucy Brice', era: 2 },
  { pieceId: 10, position: 'MF', cost: 1, nameJa: 'サミュエル・リード', nameEn: 'Samuel Reed', era: 1 },
  { pieceId: 82, position: 'MF', cost: 1, nameJa: 'ケヴィン・マホーニー', nameEn: 'Kevin Mahoney', era: 3 },
  { pieceId: 23, position: 'WG', cost: 1, nameJa: 'ルーカス・アシュクロフト', nameEn: 'Lucas Ashcroft', era: 1 },
  { pieceId: 36, position: 'FW', cost: 1, nameJa: 'フランク・マッケンジー', nameEn: 'Frank Mackenzie', era: 2 },
  { pieceId: 104, position: 'FW', cost: 1, nameJa: 'サム・ウィリアムズ', nameEn: 'Sam Williams', era: 4 },
];

interface OwnedPieceApiRow {
  piece_id: number;
  position: string;
  cost: number;
  name_ja: string;
  name_en: string;
  era: number;
}

interface CatalogApiRow {
  piece_id: number;
  position: string;
  cost: number;
  name_ja: string;
  name_en: string;
  era: number;
}

function toServerPiece(r: OwnedPieceApiRow | CatalogApiRow): ServerOwnedPiece {
  return {
    pieceId: r.piece_id,
    position: r.position,
    cost: r.cost,
    nameJa: r.name_ja,
    nameEn: r.name_en,
    era: r.era,
  };
}

/**
 * 所持コマを取得する。
 * - ログイン時: /api/pieces/sync（Founding Eleven付与+entitlement同期）→ /api/pieces
 * - ゲスト: 公開カタログからFounding Eleven 11キャラを解決
 * - いずれも失敗時は FOUNDING_ELEVEN_FALLBACK
 */
export async function fetchOwnedPieces(accessToken: string | null): Promise<ServerOwnedPiece[]> {
  try {
    if (accessToken) {
      const headers = { Authorization: `Bearer ${accessToken}` };
      // sync失敗（オフライン等）でも一覧取得は試みる
      await fetch(apiUrl('/api/pieces/sync'), { method: 'POST', headers }).catch(() => null);
      const res = await fetch(apiUrl('/api/pieces'), { headers });
      if (!res.ok) throw new Error(`pieces ${res.status}`);
      const data = await res.json() as { items?: OwnedPieceApiRow[] };
      const rows = data.items ?? [];
      if (rows.length > 0) return rows.map(toServerPiece);
      return FOUNDING_ELEVEN_FALLBACK;
    }

    const res = await fetch(apiUrl('/api/shop/catalog'));
    if (!res.ok) throw new Error(`catalog ${res.status}`);
    const data = await res.json() as { items?: CatalogApiRow[] };
    const foundingSet = new Set<number>(FOUNDING_ELEVEN_IDS);
    const founding = (data.items ?? []).filter(i => foundingSet.has(i.piece_id));
    if (founding.length === FOUNDING_ELEVEN_IDS.length) return founding.map(toServerPiece);
    return FOUNDING_ELEVEN_FALLBACK;
  } catch {
    return FOUNDING_ELEVEN_FALLBACK;
  }
}

interface TeamsApiRow {
  id: string;
  name: string;
  slot_number: number;
  is_active: boolean;
  formation_preset: string;
  fieldPieces: Array<{ piece_id: number; position: string; cost: number; col?: number; row?: number }>;
  benchPieces: Array<{ piece_id: number; position: string; cost: number }>;
}

/** サーバー保存済みチーム一覧+スロット枠情報を取得する */
export async function fetchTeams(accessToken: string): Promise<TeamsResponse | null> {
  try {
    const res = await fetch(apiUrl('/api/teams'), { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data = await res.json() as {
      teams?: TeamsApiRow[];
      max_slots?: number;
      available_slots?: number;
    };
    return {
      slots: (data.teams ?? []).map(t => ({
        teamId: t.id,
        slotNumber: t.slot_number,
        name: t.name,
        formationPreset: t.formation_preset,
        fieldPieces: t.fieldPieces ?? [],
        benchPieces: t.benchPieces ?? [],
        isActive: t.is_active,
      })),
      maxSlots: data.max_slots ?? 10,
      availableSlots: data.available_slots ?? 1,
    };
  } catch {
    return null;
  }
}

export interface SaveTeamInput {
  /** 既存スロットの上書き時に指定 */
  teamId?: string;
  slotNumber: number;
  name: string;
  formationPreset: string;
  fieldPieces: Array<{ piece_id: number; position: string; cost: number; col: number; row: number }>;
  benchPieces: Array<{ piece_id: number; position: string; cost: number }>;
}

export type SaveTeamResult =
  | { ok: true; teamId: string }
  | { ok: false; error: 'PREMIUM_REQUIRED' | 'VALIDATION' | 'NETWORK' };

/** スロットへ保存する（新規=POST / 上書き=PUT） */
export async function saveTeam(accessToken: string, input: SaveTeamInput): Promise<SaveTeamResult> {
  try {
    const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
    if (input.teamId) {
      const res = await fetch(apiUrl(`/api/teams/${input.teamId}`), {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          name: input.name,
          formation_preset: input.formationPreset,
          fieldPieces: input.fieldPieces,
          benchPieces: input.benchPieces,
        }),
      });
      if (res.status === 403) return { ok: false, error: 'PREMIUM_REQUIRED' };
      if (!res.ok) return { ok: false, error: 'VALIDATION' };
      return { ok: true, teamId: input.teamId };
    }

    const res = await fetch(apiUrl('/api/teams'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: input.name,
        slot_number: input.slotNumber,
        formation_preset: input.formationPreset,
        fieldPieces: input.fieldPieces,
        benchPieces: input.benchPieces,
      }),
    });
    if (res.status === 403) return { ok: false, error: 'PREMIUM_REQUIRED' };
    if (!res.ok) return { ok: false, error: 'VALIDATION' };
    const data = await res.json() as { id: string };
    return { ok: true, teamId: data.id };
  } catch {
    return { ok: false, error: 'NETWORK' };
  }
}

/** スロットを削除する */
export async function deleteTeam(accessToken: string, teamId: string): Promise<boolean> {
  try {
    const res = await fetch(apiUrl(`/api/teams/${teamId}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── 編成ドラフトのlocalStorage永続化（ゲスト/ログイン共通のリロード耐性） ──

const DRAFT_KEY = 'fcms_formation_draft';

export interface FormationDraft {
  teamName: string;
  presetKey: string;
  starters: Array<{ pieceId: number; col: number; row: number }>;
  bench: Array<{ pieceId: number }>;
}

export function saveDraft(draft: FormationDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ストレージ不可（プライベートモード等）は無視
  }
}

export function loadDraft(): FormationDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FormationDraft;
    if (!Array.isArray(parsed.starters) || !Array.isArray(parsed.bench)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // 無視
  }
}
