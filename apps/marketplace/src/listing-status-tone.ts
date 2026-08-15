import type { StatusTone } from '@depawn/ui';

/* Listing and offer state to tone mappings from docs/DESIGN-BRIEF.md. */
export function listingStatusTone(status: string): StatusTone {
  switch (status) {
    case 'ACTIVE':
      return 'active';
    case 'MATCHED':
      return 'success';
    default:
      return 'neutral';
  }
}

export function offerStatusTone(status: string): StatusTone {
  switch (status) {
    case 'PENDING':
      return 'active';
    case 'ACCEPTED':
      return 'success';
    case 'SUPERSEDED':
      return 'warning';
    default:
      return 'neutral';
  }
}
