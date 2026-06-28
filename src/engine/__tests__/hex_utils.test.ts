// ============================================================
// hex_utils.test.ts — HEXマップ共通ユーティリティ（基盤・純粋関数）
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  getHexEntry, getZone, getLane, isValidHex,
  getZoneByKey, getHexesByZone, getZocKeySet, boardContext,
} from '../hex_utils';

const CENTER = { col: 10, row: 16 }; // 盤内の中央付近

describe('isValidHex', () => {
  it('盤内(0-21 × 0-33)は true', () => {
    expect(isValidHex(CENTER)).toBe(true);
    expect(isValidHex({ col: 0, row: 0 })).toBe(true);
    expect(isValidHex({ col: 21, row: 33 })).toBe(true);
  });
  it('盤外は false', () => {
    expect(isValidHex({ col: -1, row: 0 })).toBe(false);
    expect(isValidHex({ col: 22, row: 0 })).toBe(false);
    expect(isValidHex({ col: 0, row: 34 })).toBe(false);
  });
});

describe('getHexEntry', () => {
  it('盤内座標はエントリを返す', () => {
    const e = getHexEntry(CENTER);
    expect(e).toBeDefined();
    expect(e!.col).toBe(10);
    expect(e!.row).toBe(16);
  });
  it('盤外は undefined', () => {
    expect(getHexEntry({ col: 99, row: 99 })).toBeUndefined();
  });
});

describe('getZone / getLane', () => {
  it('盤内はマップのゾーン/レーンを返す（getHexEntryと一致）', () => {
    const e = getHexEntry(CENTER)!;
    expect(getZone(CENTER)).toBe(e.zone);
    expect(getLane(CENTER)).toBe(e.lane);
  });
  it('盤外はデフォルトにフォールバック', () => {
    expect(getZone({ col: 99, row: 99 })).toBe('ミドルサードD');
    expect(getLane({ col: 99, row: 99 })).toBe('センターレーン');
  });
});

describe('getZoneByKey / getHexesByZone', () => {
  it('キー版ゾーン取得は座標版と一致', () => {
    expect(getZoneByKey('10,16')).toBe(getZone(CENTER));
  });
  it('ゾーン集合は当該ゾーンのHEXを含む', () => {
    const zone = getZone(CENTER);
    const set = getHexesByZone(zone);
    expect(set).toBeDefined();
    expect(set!.has('10,16')).toBe(true);
  });
  it('存在しないキーは undefined', () => {
    expect(getZoneByKey('99,99')).toBeUndefined();
  });
});

describe('getZocKeySet', () => {
  it('中央HEXは隣接6HEXを返し自分自身は含まない', () => {
    const zoc = getZocKeySet(CENTER);
    expect(zoc.size).toBe(6);
    expect(zoc.has('10,16')).toBe(false);
  });
});

describe('boardContext', () => {
  it('getZone/getLane/isValidHex が個別関数と整合', () => {
    expect(boardContext.getZone(CENTER)).toBe(getZone(CENTER));
    expect(boardContext.getLane(CENTER)).toBe(getLane(CENTER));
    expect(boardContext.isValidHex(CENTER)).toBe(true);
    expect(boardContext.isValidHex({ col: -1, row: -1 })).toBe(false);
  });
});
