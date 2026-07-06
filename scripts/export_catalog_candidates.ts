#!/usr/bin/env npx tsx
// Export Platform catalog candidates from the canonical 200-character roster.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT_PATH = resolve(__dirname, '../docs/lore/characters_200.csv');
const OUTPUT_PATH = resolve(__dirname, '../output/catalog_candidates_fcms.csv');
const GAME_ID = 'football_chess_maniacs';

interface CharacterRow {
  id: string;
  nameJa: string;
  nameEn: string;
  position: string;
  cost: string;
  isFcg: boolean;
  summary: string;
}

function parseRow(line: string, lineNumber: number): CharacterRow {
  const parts = line.split(',');
  if (parts.length !== 10) {
    throw new Error(`Line ${lineNumber}: expected 10 CSV fields, got ${parts.length}`);
  }
  const [id, nameJa, nameEn, position, cost, , , , isFcg, summary] = parts;
  if (!/^\d{3}$/.test(id)) throw new Error(`Line ${lineNumber}: invalid id "${id}"`);
  return {
    id,
    nameJa,
    nameEn,
    position,
    cost,
    isFcg: isFcg === 'true',
    summary,
  };
}

function csvCell(value: string | number | boolean | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function suggestedTier(row: CharacterRow): { tier: 'tier_a' | 'tier_s'; note: string } {
  const notes: string[] = [];
  if (row.cost === 'SS') notes.push('SSコスト枠');
  if (row.isFcg) notes.push('初期配布');
  return {
    tier: row.cost === 'SS' ? 'tier_s' : 'tier_a',
    note: notes.join(' / '),
  };
}

const csv = readFileSync(INPUT_PATH, 'utf-8').trim();
const lines = csv.split('\n');
const rows = lines.slice(1).filter(Boolean).map((line, idx) => parseRow(line.trim(), idx + 2));

if (rows.length !== 200) {
  throw new Error(`Expected 200 catalog candidate rows, got ${rows.length}`);
}

const header = [
  'game_id',
  'item_id',
  'name_ja',
  'name_en',
  'category',
  'image_path',
  'suggested_tier',
  'sell_flag',
  'notes',
];

const output = [
  header.join(','),
  ...rows.map((row) => {
    const tier = suggestedTier(row);
    return [
      GAME_ID,
      `piece_${row.id}`,
      row.nameJa,
      row.nameEn,
      'piece',
      `assets/pieces/${row.id}.png`,
      tier.tier,
      '',
      tier.note,
    ].map(csvCell).join(',');
  }),
  [
    GAME_ID,
    'formation_save_slot',
    '編成保存枠',
    'Formation Save Slot',
    'save_slot',
    '',
    'tier_b',
    '',
    '編成保存枠',
  ].map(csvCell).join(','),
];

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, `${output.join('\n')}\n`, 'utf-8');
console.log(`Exported ${rows.length} piece rows + 1 save-slot row to ${OUTPUT_PATH}`);
