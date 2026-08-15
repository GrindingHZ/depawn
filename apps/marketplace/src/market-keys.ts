export const marketKeys = {
  browse: ['listings', 'browse'] as const,
  detail: (listingId: string) => ['listings', 'detail', listingId] as const,
  myListings: ['listings', 'mine'] as const,
  myOffers: ['offers', 'mine'] as const,
  myReceipts: ['receipts', 'mine'] as const,
};
