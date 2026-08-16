/* Every term the product uses that a person might not already know, in one
   place. Two parts, always: what it is, then what it means for the reader.
   The second is the half that teaches; a dictionary definition on its own
   leaves somebody none the wiser about their own money.

   Keyed by id rather than by the words on screen, so the copy can be
   translated and so two screens explaining the same term cannot drift. */

export type GlossaryAudience = 'borrower' | 'lender' | 'any';

export interface GlossaryEntry {
  readonly term: string;
  readonly definition: string;
  /* Keyed by who is reading. The same fact lands differently depending on
     which side of the loan you are on: grace is protection to a borrower and
     a delay to a lender. */
  readonly matters: Partial<Record<GlossaryAudience, string>>;
}

export const glossary: Record<string, GlossaryEntry> = {
  appraisedValue: {
    term: 'Appraised value',
    definition:
      'What our vault staff valued the item at when they took custody, using comparable sales. Items above a set threshold need two independent appraisals.',
    matters: {
      lender: 'This is the ceiling on what can be recovered if the borrower does not repay.',
      borrower: 'Your loan is capped at a share of this, which depends on what the item is.',
    },
  },
  loanToValue: {
    term: 'Loan to value',
    definition:
      'The loan divided by the appraised value of the item behind it. Lower means more security behind every dollar lent.',
    matters: {
      lender:
        'At 20%, the item would have to lose four fifths of its value before your principal is at risk.',
      borrower: 'The lower this is, the more comfortably your item covers what you are borrowing.',
    },
  },
  lendingCeiling: {
    term: 'Lending ceiling',
    definition:
      'The most that can be borrowed against this item. It is a share of the appraised value, and the share depends on the category: we lend against more of a gold bar than a painting, because one of them sells the same day.',
    matters: {
      borrower: 'Asking for more than this is refused, however willing a lender might be.',
      lender: 'An offer above this cannot be accepted, so it would only tie up your money.',
    },
  },
  originationFee: {
    term: 'Origination fee',
    definition:
      'What we charge for writing the loan, taken from the principal at the moment it is funded.',
    matters: {
      borrower:
        'You receive the principal less this fee, so the amount that lands is slightly less.',
      lender: 'It comes out of the borrower side, not yours. You are owed the full principal.',
    },
  },
  gracePeriod: {
    term: 'Grace period',
    definition:
      'A stretch of time after the loan matures during which the borrower can still repay in full and keep the item.',
    matters: {
      borrower:
        'Missing your maturity date does not cost you the item. Missing the end of grace does.',
      lender:
        'You cannot begin a claim until grace has run out. Interest stops accruing at maturity, not at the end of grace.',
    },
  },
  maturity: {
    term: 'Maturity',
    definition:
      'The date the loan is due. Interest stops accruing here and does not grow after it.',
    matters: {
      borrower: 'Repaying late costs you no extra interest, but it does start the clock on grace.',
      lender: 'Your return is fixed at this date. Waiting longer does not earn you more.',
    },
  },
  totalRepayable: {
    term: 'Total repayable',
    definition:
      'The principal plus the interest accrued so far. What it would cost to settle today.',
    matters: {
      borrower: 'This is the single figure that clears the loan and releases your item.',
    },
  },
  custodyReceipt: {
    term: 'Custody receipt',
    definition:
      'Proof that a specific item is in our vault, what it was valued at, who appraised it and when it was sealed. It is what a loan is secured against.',
    matters: {
      borrower: 'Holding it means the item is yours to borrow against or to collect.',
      lender: 'The receipt, not a promise, is what stands behind the money you lend.',
    },
  },
  heldFunds: {
    term: 'Held funds',
    definition:
      'Money committed to an offer you have placed. It is still yours, but it cannot be spent twice while the offer stands.',
    matters: {
      lender:
        'If you are outbid or your offer expires, you reclaim it yourself. Nothing moves your money without you asking.',
    },
  },
  reservePrice: {
    term: 'Reserve price',
    definition: 'The lowest bid a sale will accept. Bids below it are refused outright.',
    matters: {
      lender: 'It protects you from the item going for a fraction of what is owed to you.',
      borrower: 'It protects you too: a low sale would leave you owing the shortfall.',
    },
  },
  liquidation: {
    term: 'Liquidation',
    definition:
      'The sale of an item after a loan has defaulted and the statutory holding period has passed. Proceeds pay the lender first, then our fee, then the rest returns to the borrower.',
    matters: {
      borrower: 'Anything left after the debt and the fee comes back to you. It is not forfeit.',
      lender: 'You are paid first out of whatever the sale raises, up to what you are owed.',
    },
  },
};

export function explain(termId: string): GlossaryEntry | null {
  return glossary[termId] ?? null;
}

export function mattersFor(entry: GlossaryEntry, audience: GlossaryAudience): string | null {
  return entry.matters[audience] ?? entry.matters.any ?? null;
}
