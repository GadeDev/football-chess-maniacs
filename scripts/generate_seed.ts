#!/usr/bin/env npx tsx
// ============================================================
// generate_seed.ts — docs/lore/characters_200.csv → piece_master_seed.sql
// ============================================================

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve(__dirname, '../docs/lore/characters_200.csv');
const OUT_PATH = resolve(__dirname, 'piece_master_seed.sql');

const COST_MAP: Record<string, number> = {
  '1': 1,
  '1+': 1.5,
  '2': 2,
  '2+': 2.5,
  SS: 3,
};

const ERA_SHELF_MAP: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 2,
  5: 3,
  6: 3,
  7: 4,
  8: 5,
  9: 5,
  10: 6,
  11: 6,
  12: 7,
  13: 7,
};

const NAT_MAP: Record<string, string> = {
  英: 'GB-ENG',
  蘇: 'GB-SCO',
  愛: 'IE',
  独: 'DE',
  東独: 'DE',
  '東独→独': 'DE',
  仏: 'FR',
  伊: 'IT',
  西: 'ES',
  葡: 'PT',
  蘭: 'NL',
  墺: 'AT',
  匈: 'HU',
  捷: 'CZ',
  波: 'PL',
  瑞典: 'SE',
  諾: 'NO',
  芬: 'FI',
  丁抹: 'DK',
  露: 'RU',
  塞: 'RS',
  南斯: 'YU',
  克: 'HR',
  伯: 'BR',
  亜: 'AR',
  智: 'CL',
  烏: 'UY',
  中: 'CN',
  日: 'JP',
  韓: 'KR',
  印: 'IN',
  埃: 'EG',
  奈: 'NG',
  咖麦隆: 'CM',
  塞内加: 'SN',
  坦: 'TZ',
  馬: 'ML',
  牙買加: 'JM',
  '仏/烏': 'FR',
  '仏/阿': 'FR',
  '葡/伯': 'PT',
  '塞/蒙': 'ME',
  '波/波黑': 'BA',
};

const FAMILY_MAP: Record<string, string> = {
  ブラックウッド: 'blackwood',
  マクファーレン: 'macfarlane',
  モンテフィオーレ: 'montefiore',
  ヴァイスハウプト: 'weisshaupt',
  デュボワ: 'dubois',
  シルヴァ: 'silva',
  コヴァチェヴィッチ: 'kovacevic',
  オコンクウォ: 'okonkwo',
};

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"' && quoted && next === '"') {
      current += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseFamily(raw: string): string | null {
  if (raw === 'FC Grassroots') return null;
  if (raw.startsWith('無所属')) return null;
  for (const [ja, key] of Object.entries(FAMILY_MAP)) {
    if (raw.includes(ja)) return key;
  }
  return null;
}

function parseNationality(raw: string): string {
  const mapped = NAT_MAP[raw];
  if (mapped) return mapped;
  return raw;
}

function parseBool(raw: string): boolean {
  return /^(true|1|yes)$/i.test(raw.trim());
}

function escSql(s: string): string {
  return s.replace(/'/g, "''");
}

const csv = readFileSync(CSV_PATH, 'utf-8').replace(/^\uFEFF/, '');
const lines = csv.trim().split(/\r?\n/);
const header = parseCsvLine(lines[0]);
const rows = lines.slice(1).map((line, lineIndex) => {
  const fields = parseCsvLine(line);
  if (fields.length !== header.length) {
    throw new Error(`Line ${lineIndex + 2}: expected ${header.length} fields, got ${fields.length}`);
  }
  return Object.fromEntries(header.map((key, i) => [key, fields[i] ?? '']));
});

console.log(`Header: ${header.join(',')}`);
console.log(`Rows: ${rows.length}`);

const inserts: string[] = [
  '-- ============================================================',
  '-- piece_master_seed.sql — 200人コマ原本データ投入',
  '-- Generated from docs/lore/characters_200.csv',
  '-- ============================================================',
  '',
];

let errors = 0;

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const lineNo = i + 2;
  const idStr = row.id;
  const pieceId = Number.parseInt(idStr, 10);
  const cost = COST_MAP[row.cost];
  const era = Number.parseInt(row.era, 10);
  const eraShelf = row.era_shelf ? Number.parseInt(row.era_shelf, 10) : ERA_SHELF_MAP[era];

  if (!Number.isInteger(pieceId) || pieceId < 1 || pieceId > 200) {
    console.error(`Line ${lineNo}: invalid id "${idStr}"`);
    errors++;
  }
  if (cost === undefined) {
    console.error(`Line ${lineNo}: unknown cost "${row.cost}"`);
    errors++;
  }
  if (!eraShelf) {
    console.error(`Line ${lineNo}: unknown era/era_shelf "${row.era}/${row.era_shelf}"`);
    errors++;
  }

  const family = parseFamily(row.family);
  const nationality = parseNationality(row.nationality);
  const isFounding = parseBool(row.is_fcg) ? 1 : 0;
  const isPurchasable = row.is_purchasable ? (parseBool(row.is_purchasable) ? 1 : 0) : (isFounding ? 0 : 1);
  const sku = `fcms_piece_${idStr.padStart(3, '0')}`;
  const familySql = family ? `'${escSql(family)}'` : 'NULL';

  inserts.push(
    `INSERT INTO piece_master (piece_id, sku, name_ja, name_en, position, cost, era, era_shelf, family, nationality, is_founding, is_purchasable, summary_ja, image_status) VALUES (${pieceId}, '${sku}', '${escSql(row.name_ja)}', '${escSql(row.name_en)}', '${row.position}', ${cost}, ${era}, ${eraShelf}, ${familySql}, '${nationality}', ${isFounding}, ${isPurchasable}, '${escSql(row.summary)}', 'ready');`,
  );
}

if (errors > 0) {
  console.error(`\n${errors} errors found. Fix CSV and re-run.`);
  process.exit(1);
}

writeFileSync(OUT_PATH, inserts.join('\n') + '\n', 'utf-8');
console.log(`\nGenerated ${rows.length} INSERT statements -> ${OUT_PATH}`);
