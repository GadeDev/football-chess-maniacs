import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const CLIENT_ROOT = path.resolve(process.cwd(), 'src/client');
const JAPANESE = /[ぁ-んァ-ヶ一-龠々ー]/;

const ALLOWED_JAPANESE = new Map<string, Set<string>>([
  ['pages/Battle.tsx', new Set(['現代'])],
  ['pages/Matching.tsx', new Set(['現代'])],
  ['utils/formationServer.ts', new Set([
    'トム・ハーディング',
    'イライジャ・マッケイ',
    'マリウス・ベックマン',
    'ヨゼフ・ハートマン',
    'エルネスト・リベラ',
    'ルーシー・ブライス',
    'サミュエル・リード',
    'ケヴィン・マホーニー',
    'ルーカス・アシュクロフト',
    'フランク・マッケンジー',
    'サム・ウィリアムズ',
  ])],
]);

const MIGRATED_UI_LITERALS = new Set([
  'KICK OFF', '1st Half', 'HALF TIME', '2nd Half', 'SECOND HALF', 'FULL TIME',
  'GOOAL!', 'GOAL!', 'GOAL!!', 'SAVED!', 'SAVE!', 'MISS!', 'MISSED!', 'BLOCKED!',
  'GK CATCH!', 'GREAT SAVE!', 'TACKLE', 'TACKLE!', 'BREAK', 'BREAKTHROUGH!',
  'FOUL', 'FOUL!', 'OFFSIDE', 'OFFSIDE!', 'INTERCEPTED', 'BALL CUT!', 'LOOSE BALL!',
  'DELAY!', 'PASSIVE TACTICS!', 'HOME WIN!', 'AWAY WIN!', 'WIN', 'LOSE', 'DRAW',
  'SHOP', 'SETTINGS', 'RANKING', 'PROFILE', 'FRIEND MATCH', 'PRESET TEAMS',
  'REPLAY — Turn', 'FREE', 'SHOOT %',
]);

function productionFiles(): string[] {
  const result: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'i18n' && entry.name !== '__tests__') walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        result.push(full);
      }
    }
  };
  walk(CLIENT_ROOT);
  return result;
}

function stringValues(file: string): Array<{ value: string; line: number; userFacing: boolean }> {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const values: Array<{ value: string; line: number; userFacing: boolean }> = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node)) {
      const value = node.text.replace(/\s+/g, ' ').trim();
      if (value) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        let userFacing = ts.isJsxText(node);
        let parent: ts.Node | undefined = node.parent;
        while (parent && !ts.isSourceFile(parent)) {
          if (ts.isJsxExpression(parent) || ts.isJsxAttribute(parent)) userFacing = true;
          if (ts.isCallExpression(parent) && parent.arguments[0] === node && parent.expression.getText(sourceFile).includes('showOverlay')) {
            userFacing = true;
          }
          if (ts.isPropertyAssignment(parent) && parent.initializer === node && parent.name.getText(sourceFile).replace(/["']/g, '') === 'text') {
            userFacing = true;
          }
          parent = parent.parent;
        }
        values.push({ value, line: line + 1, userFacing });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return values;
}

describe('i18n文字列棚卸しの回帰監査', () => {
  it('クライアントに未分類の日本語リテラルを増やさない', () => {
    const violations: string[] = [];
    for (const file of productionFiles()) {
      const relative = path.relative(CLIENT_ROOT, file);
      const allowed = ALLOWED_JAPANESE.get(relative) ?? new Set<string>();
      for (const { value, line } of stringValues(file)) {
        if (JAPANESE.test(value) && !allowed.has(value)) violations.push(`${relative}:${line} ${value}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('辞書へ移した演出・画面ラベルを再び直書きしない', () => {
    const violations: string[] = [];
    for (const file of productionFiles()) {
      const relative = path.relative(CLIENT_ROOT, file);
      for (const { value, line, userFacing } of stringValues(file)) {
        if (userFacing && MIGRATED_UI_LITERALS.has(value)) violations.push(`${relative}:${line} ${value}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('モジュール直下でt()/tn()を評価しない', () => {
    const violations: string[] = [];
    for (const file of productionFiles()) {
      const source = fs.readFileSync(file, 'utf8');
      const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['t', 'tn'].includes(node.expression.text)) {
          let parent: ts.Node | undefined = node.parent;
          let insideFunction = false;
          while (parent && !ts.isSourceFile(parent)) {
            if (ts.isFunctionLike(parent)) {
              insideFunction = true;
              break;
            }
            parent = parent.parent;
          }
          if (!insideFunction) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
            violations.push(`${path.relative(CLIENT_ROOT, file)}:${line + 1}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    expect(violations).toEqual([]);
  });

  it('canvas・実行時enumに内部英語トークンを直結しない', () => {
    const checks = [
      ['components/board/Overlay.tsx', /fillText\(\s*`LONG\s*\(/],
      ['components/ui/SidePanel.tsx', /default:\s*return\s+event\.type/],
      ['pages/Matching.tsx', />\(\{wsStatus\}\)<\/span>/],
    ] as const;
    const violations = checks.flatMap(([relative, pattern]) => {
      const source = fs.readFileSync(path.join(CLIENT_ROOT, relative), 'utf8');
      return pattern.test(source) ? [relative] : [];
    });
    expect(violations).toEqual([]);
  });
});
