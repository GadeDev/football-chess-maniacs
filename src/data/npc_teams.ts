// ============================================================
// npc_teams.ts — NPC チーム定義（7時代 × 1チーム）
// Generated from the GrassrootsUniverse canonical roster.
// ============================================================

export interface NpcTeamPiece {
  piece_id: number;
  position: string;
  col: number;
  row: number;
}

export interface NpcTeam {
  id: string;
  shelf: number;
  name_ja: string;
  name_en: string;
  formation: string;
  starters: NpcTeamPiece[];
  total_cost: number;
}

/**
 * 7 NPC teams by era shelf.
 * Each team keeps canonical character positions and excludes Founding Eleven.
 */
export const NPC_TEAMS: NpcTeam[] = [
  {
    id: 'npc_shelf_1',
    shelf: 1,
    name_ja: '草創期オールスター',
    name_en: 'Dawn All-Stars',
    formation: '4-4-2',
    total_cost: 19.5,
    starters: [
      { piece_id: 5, position: 'GK', col: 10, row: 30 },  // Henry Ashworth GK 1+
      { piece_id: 1, position: 'DF', col: 4, row: 27 },  // Edmund Blackwood DF 2
      { piece_id: 20, position: 'DF', col: 8, row: 27 },  // Friedrich Bauer DF 2
      { piece_id: 17, position: 'DF', col: 12, row: 27 },  // Dušan Kovačević DF 1+
      { piece_id: 18, position: 'SB', col: 16, row: 27 },  // Ned MacFarlane SB 1+
      { piece_id: 2, position: 'VO', col: 4, row: 24 },  // Archie MacFarlane VO 1+
      { piece_id: 6, position: 'MF', col: 8, row: 24 },  // Duncan Caird MF 1
      { piece_id: 3, position: 'OM', col: 12, row: 24 },  // Hamish MacFarlane OM SS
      { piece_id: 22, position: 'WG', col: 16, row: 24 },  // Thomas O'Brien WG 1
      { piece_id: 13, position: 'FW', col: 8, row: 21 },  // James Blackwood FW 2+
      { piece_id: 4, position: 'FW', col: 12, row: 21 },  // Wilfred Thorne FW 2
    ],
  },

  {
    id: 'npc_shelf_2',
    shelf: 2,
    name_ja: '戦間期オールスター',
    name_en: 'Interwar All-Stars',
    formation: '3-5-2',
    total_cost: 19,
    starters: [
      { piece_id: 33, position: 'GK', col: 10, row: 30 },  // Albert Kent GK 1
      { piece_id: 25, position: 'DF', col: 6, row: 27 },  // Viktor Weisshaupt DF 2
      { piece_id: 34, position: 'DF', col: 10, row: 27 },  // Jan Novák DF 1
      { piece_id: 50, position: 'DF', col: 14, row: 27 },  // Hannah Brighton DF 1+
      { piece_id: 29, position: 'VO', col: 4, row: 24 },  // Miloš Kovačević VO 2
      { piece_id: 27, position: 'MF', col: 7, row: 24 },  // Pierre Dubois MF 1+
      { piece_id: 54, position: 'MF', col: 10, row: 24 },  // Luis Cabrera MF 1
      { piece_id: 38, position: 'OM', col: 13, row: 24 },  // Dorothy Blackwood OM SS
      { piece_id: 49, position: 'WG', col: 16, row: 24 },  // Aaron Adeyo WG 1+
      { piece_id: 42, position: 'FW', col: 8, row: 21 },  // Ernest Blackwood FW 2+
      { piece_id: 28, position: 'FW', col: 12, row: 21 },  // Paulo Silva FW 2
    ],
  },

  {
    id: 'npc_shelf_3',
    shelf: 3,
    name_ja: '戦後オールスター',
    name_en: 'Post-War All-Stars',
    formation: '3-4-3',
    total_cost: 18.5,
    starters: [
      { piece_id: 80, position: 'GK', col: 10, row: 30 },  // Gianni Rossi GK 1+
      { piece_id: 59, position: 'DF', col: 6, row: 27 },  // Heinrich Weisshaupt DF 2
      { piece_id: 66, position: 'DF', col: 10, row: 27 },  // Sergio Fernandez DF 1
      { piece_id: 60, position: 'VO', col: 14, row: 27 },  // Klaus Weisshaupt VO 2
      { piece_id: 65, position: 'MF', col: 4, row: 24 },  // André Dubois MF 1+
      { piece_id: 67, position: 'MF', col: 8, row: 24 },  // Marta Cardoso MF 1
      { piece_id: 56, position: 'OM', col: 12, row: 24 },  // Natalia Volkova OM SS
      { piece_id: 63, position: 'WG', col: 16, row: 24 },  // Pierluigi Zanetti WG 1+
      { piece_id: 57, position: 'FW', col: 6, row: 21 },  // Gino Montefiore FW 2+
      { piece_id: 64, position: 'FW', col: 10, row: 21 },  // Robert Blackwood FW 1+
      { piece_id: 69, position: 'FW', col: 14, row: 21 },  // Owen Ama FW 1
    ],
  },

  {
    id: 'npc_shelf_4',
    shelf: 4,
    name_ja: '拡張期オールスター',
    name_en: 'Expansion All-Stars',
    formation: '4-4-2',
    total_cost: 20,
    starters: [
      { piece_id: 98, position: 'GK', col: 10, row: 30 },  // Sergei Ivanov GK 1+
      { piece_id: 77, position: 'DF', col: 4, row: 27 },  // Curtis Blackwood DF 2
      { piece_id: 81, position: 'DF', col: 8, row: 27 },  // Alejandro Vargas DF 1+
      { piece_id: 86, position: 'DF', col: 12, row: 27 },  // Takashi Nakamura DF 1
      { piece_id: 78, position: 'SB', col: 16, row: 27 },  // Hamish MacFarlane II SB 2
      { piece_id: 74, position: 'VO', col: 4, row: 24 },  // Otto Weisshaupt VO 2+
      { piece_id: 76, position: 'MF', col: 8, row: 24 },  // Jean-Luc Dubois MF 2
      { piece_id: 90, position: 'OM', col: 12, row: 24 },  // Paolo Montefiore OM 2+
      { piece_id: 75, position: 'WG', col: 16, row: 24 },  // Akwasi Okonkwo WG 2
      { piece_id: 85, position: 'FW', col: 8, row: 21 },  // Ousmane Diallo FW 1
      { piece_id: 97, position: 'FW', col: 12, row: 21 },  // Manuel Castro FW 2
    ],
  },

  {
    id: 'npc_shelf_5',
    shelf: 5,
    name_ja: '近代化期オールスター',
    name_en: 'Modernization All-Stars',
    formation: '4-2-3-1',
    total_cost: 19.5,
    starters: [
      { piece_id: 114, position: 'GK', col: 10, row: 30 },  // Claudio Rossini GK 1+
      { piece_id: 107, position: 'DF', col: 4, row: 27 },  // Marco Montefiore DF 2+
      { piece_id: 109, position: 'DF', col: 8, row: 27 },  // Nigel Blackwood DF 2
      { piece_id: 116, position: 'SB', col: 12, row: 27 },  // Ian MacFarlane SB 1+
      { piece_id: 136, position: 'SB', col: 16, row: 27 },  // Gregor Novák SB 1
      { piece_id: 108, position: 'VO', col: 8, row: 25 },  // Karl Weisshaupt VO 2+
      { piece_id: 119, position: 'VO', col: 12, row: 25 },  // Harold Jansen VO 1
      { piece_id: 105, position: 'OM', col: 6, row: 22 },  // Luis Arano OM SS
      { piece_id: 120, position: 'MF', col: 10, row: 22 },  // Hiroshi Yamada MF 1
      { piece_id: 115, position: 'WG', col: 14, row: 22 },  // Bobby Morris WG 1+
      { piece_id: 110, position: 'FW', col: 10, row: 20 },  // João Silva II FW 2
    ],
  },

  {
    id: 'npc_shelf_6',
    shelf: 6,
    name_ja: 'グローバル期オールスター',
    name_en: 'Global All-Stars',
    formation: '4-3-3',
    total_cost: 20,
    starters: [
      { piece_id: 151, position: 'GK', col: 10, row: 30 },  // Thomas Nielsen GK 1
      { piece_id: 141, position: 'DF', col: 4, row: 27 },  // Daniele Montefiore DF 2+
      { piece_id: 161, position: 'DF', col: 8, row: 27 },  // Iñigo Vázquez DF 2
      { piece_id: 154, position: 'DF', col: 12, row: 27 },  // Amir Hassan DF 1
      { piece_id: 150, position: 'SB', col: 16, row: 27 },  // Emmanuel MacFarlane SB 1+
      { piece_id: 144, position: 'VO', col: 6, row: 24 },  // Heinrich Weisshaupt II VO 2
      { piece_id: 140, position: 'MF', col: 10, row: 24 },  // George Blackwood MF 2+
      { piece_id: 156, position: 'OM', col: 14, row: 24 },  // Sanae Furukawa OM SS
      { piece_id: 149, position: 'WG', col: 4, row: 21 },  // Kamal Okonkwo WG 1+
      { piece_id: 143, position: 'FW', col: 10, row: 21 },  // Cláudio Silva FW 2
      { piece_id: 152, position: 'FW', col: 16, row: 21 },  // Patrick Ngoma FW 1
    ],
  },

  {
    id: 'npc_shelf_7',
    shelf: 7,
    name_ja: '現代オールスター',
    name_en: 'Present All-Stars',
    formation: '3-4-3',
    total_cost: 20,
    starters: [
      { piece_id: 184, position: 'GK', col: 10, row: 30 },  // Diego González GK 1
      { piece_id: 176, position: 'DF', col: 6, row: 27 },  // Ivan Petrović DF 2
      { piece_id: 195, position: 'DF', col: 10, row: 27 },  // Emilia Bergman DF 1+
      { piece_id: 169, position: 'DF', col: 14, row: 27 },  // Takuma Ishihara DF 1
      { piece_id: 160, position: 'VO', col: 4, row: 24 },  // Franz Weisshaupt VO 2
      { piece_id: 173, position: 'MF', col: 8, row: 24 },  // Nils Weisshaupt MF 2+
      { piece_id: 187, position: 'OM', col: 12, row: 24 },  // Benedikt Weisshaupt OM SS
      { piece_id: 190, position: 'WG', col: 16, row: 24 },  // Musa Okonkwo WG 2
      { piece_id: 178, position: 'FW', col: 6, row: 21 },  // Marcos Almeida FW 2
      { piece_id: 192, position: 'FW', col: 10, row: 21 },  // Júlia Silva FW 2
      { piece_id: 200, position: 'FW', col: 14, row: 21 },  // Pietro De Sanctis FW 1
    ],
  },

];

/** shelf番号からNPCチームを取得 */
export function getNpcTeamByShelf(shelf: number): NpcTeam | undefined {
  return NPC_TEAMS.find((t) => t.shelf === shelf);
}