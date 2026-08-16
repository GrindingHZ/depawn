import type { ItemCategoryDto } from './custody';

/* `BULLION` is a correct domain state and a poor thing to show a person. The
   enum stays exactly as it is on the wire; this is the only place that turns
   one into words, which is also what makes it translatable later. */
const names: Record<ItemCategoryDto, string> = {
  BULLION: 'Bullion',
  WATCH: 'Watch',
  JEWELLERY: 'Jewellery',
  COLLECTIBLE: 'Collectible',
  ART: 'Art',
};

export function nameForCategory(category: string): string {
  return category in names ? names[category as ItemCategoryDto] : category;
}

/* How much of an appraisal we will lend against, by category, as a share.
   Shown so a lender can see why one item supports a larger loan than another
   of the same value. The authority is the protocol parameters; this is copy
   about them, not a second source of truth, so a screen that needs the real
   number reads it from the api. */
const liquidityNotes: Record<ItemCategoryDto, string> = {
  BULLION: 'Spot priced and sells the same day, so we lend against the most of it.',
  WATCH: 'A deep resale market, though what it fetches depends on the model.',
  JEWELLERY: 'Melt value sets a floor; the rest is a premium somebody has to want.',
  COLLECTIBLE: 'A thin market where condition and grading move the price sharply.',
  ART: 'Illiquid and slow to sell, and the appraisal is ultimately an opinion.',
};

export function liquidityNoteForCategory(category: string): string | null {
  return category in liquidityNotes ? liquidityNotes[category as ItemCategoryDto] : null;
}
