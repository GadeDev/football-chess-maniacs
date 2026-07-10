import { legacyDefaultSlotNames } from '../i18n/legacyDefaults';
import { SUPPORTED_LOCALES, tForLocale } from '../i18n';

const STORAGE_PREFIX = '__FCMS_DEFAULT_SLOT_';

/** APIの非空制約を満たしつつ、表示言語を永続データへ焼き込まない内部名。 */
export function defaultSlotStorageName(slotNumber: number): string {
  return `${STORAGE_PREFIX}${slotNumber}__`;
}

/** 現行sentinelと、旧版が7言語で保存した翻訳済み既定名を未指定へ戻す。 */
export function normalizeStoredSlotName(name: string | undefined, slotNumber: number): string | undefined {
  if (!name || name === defaultSlotStorageName(slotNumber)) return undefined;
  const wasLocalizedDefault = legacyDefaultSlotNames(slotNumber).includes(name)
    || SUPPORTED_LOCALES.some(
      (locale) => name === tForLocale(locale, 'formation.slot_n', { n: slotNumber }),
    );
  return wasLocalizedDefault ? undefined : name;
}
