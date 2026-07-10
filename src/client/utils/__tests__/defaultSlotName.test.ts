import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES, tForLocale } from '../../i18n';
import { defaultSlotStorageName, normalizeStoredSlotName } from '../defaultSlotName';

describe('default slot name persistence', () => {
  it('言語非依存の内部名を生成して未指定へ戻す', () => {
    const stored = defaultSlotStorageName(3);
    expect(stored).toBe('__FCMS_DEFAULT_SLOT_3__');
    expect(normalizeStoredSlotName(stored, 3)).toBeUndefined();
  });

  it('旧版が全対応言語で保存した既定名を正規化する', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const legacy = tForLocale(locale, 'formation.slot_n', { n: 2 });
      expect(normalizeStoredSlotName(legacy, 2), locale).toBeUndefined();
    }
  });

  it('ユーザーが付けた名前は保持する', () => {
    expect(normalizeStoredSlotName('My Golden XI', 1)).toBe('My Golden XI');
  });
});
