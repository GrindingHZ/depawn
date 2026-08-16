/* What the vault will take in. The list is deliberately short: every category
   here is one our appraisers can value against an external reference, and one
   a liquidator can actually sell (docs/OPEN-QUESTIONS.md Q-003). */
export type ItemCategory = 'BULLION' | 'WATCH' | 'JEWELLERY' | 'COLLECTIBLE' | 'ART';

export const itemCategories: readonly ItemCategory[] = [
  'BULLION',
  'WATCH',
  'JEWELLERY',
  'COLLECTIBLE',
  'ART',
];

export function isItemCategory(value: string): value is ItemCategory {
  return (itemCategories as readonly string[]).includes(value);
}
