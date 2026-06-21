// ============================================================
// presetTeams.ts — 世界観NPCチームをプリセット選択用に変換
// ============================================================

import type { Position } from '../engine/types';
import { NPC_TEAMS } from './npc_teams';
import { PIECE_CATALOG } from './pieceCatalog';

export interface PresetPiece {
  pieceId: number;
  position: Position;
  originalPosition: Position;
  cost: (typeof PIECE_CATALOG)[number]['cost'];
  name: string;
  nameEn: string;
  summary: string;
  col: number;
  row: number;
}

export interface PresetTeam {
  id: string;
  name: string;
  nameEn: string;
  era: number;
  formation: string;
  emoji: string;
  totalCost: number;
  pieces: PresetPiece[];
}

const SHELF_LABELS: Record<number, string> = {
  1: 'S1',
  2: 'S2',
  3: 'S3',
  4: 'S4',
  5: 'S5',
  6: 'S6',
  7: 'S7',
};

function toPosition(position: string): Position {
  if (['GK', 'DF', 'SB', 'VO', 'MF', 'OM', 'WG', 'FW'].includes(position)) {
    return position as Position;
  }
  throw new Error(`Unknown preset position: ${position}`);
}

function toPresetPiece(piece: (typeof NPC_TEAMS)[number]['starters'][number]): PresetPiece {
  const catalog = PIECE_CATALOG[piece.piece_id];
  if (!catalog) {
    throw new Error(`Missing preset piece catalog entry: ${piece.piece_id}`);
  }

  return {
    pieceId: piece.piece_id,
    position: toPosition(piece.position),
    originalPosition: catalog.position,
    cost: catalog.cost,
    name: catalog.name,
    nameEn: catalog.nameEn,
    summary: catalog.summary,
    col: piece.col,
    row: piece.row,
  };
}

export const PRESET_TEAMS: PresetTeam[] = NPC_TEAMS.map((team) => {
  const pieces = team.starters.map(toPresetPiece);
  return {
    id: team.id,
    name: team.name_ja,
    nameEn: team.name_en,
    era: team.shelf,
    formation: team.formation,
    emoji: SHELF_LABELS[team.shelf] ?? `S${team.shelf}`,
    totalCost: pieces.reduce((sum, piece) => sum + piece.cost, 0),
    pieces,
  };
});
