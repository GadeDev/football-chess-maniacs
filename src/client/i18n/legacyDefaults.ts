/** sentinel導入前にサーバーへ保存され得た、7言語のスロット既定名。訳文変更後も消さない。 */
const LEGACY_SLOT_TEMPLATES = [
  'スロット {n}',
  'Slot {n}',
  '슬롯 {n}',
  'Ranura {n}',
  'Platz {n}',
  '栏位 {n}',
] as const;

export function legacyDefaultSlotNames(slotNumber: number): string[] {
  return LEGACY_SLOT_TEMPLATES.map((template) => template.replace('{n}', String(slotNumber)));
}
