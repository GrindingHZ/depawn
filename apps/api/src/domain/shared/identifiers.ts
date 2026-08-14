import type { Brand } from './brand';

export type AccountId = Brand<string, 'AccountId'>;
export type StaffId = Brand<string, 'StaffId'>;
export type VaultId = Brand<string, 'VaultId'>;
export type ReceiptId = Brand<string, 'ReceiptId'>;
export type ListingId = Brand<string, 'ListingId'>;
export type OfferId = Brand<string, 'OfferId'>;
export type LoanId = Brand<string, 'LoanId'>;
export type LenderNoteId = Brand<string, 'LenderNoteId'>;
export type BorrowerNoteId = Brand<string, 'BorrowerNoteId'>;
export type LiquidationId = Brand<string, 'LiquidationId'>;
export type FundsHoldId = Brand<string, 'FundsHoldId'>;
export type SessionId = Brand<string, 'SessionId'>;

export function accountIdOf(value: string): AccountId {
  return value as AccountId;
}

export function staffIdOf(value: string): StaffId {
  return value as StaffId;
}

export function vaultIdOf(value: string): VaultId {
  return value as VaultId;
}

export function receiptIdOf(value: string): ReceiptId {
  return value as ReceiptId;
}

export function listingIdOf(value: string): ListingId {
  return value as ListingId;
}

export function offerIdOf(value: string): OfferId {
  return value as OfferId;
}

export function loanIdOf(value: string): LoanId {
  return value as LoanId;
}

export function lenderNoteIdOf(value: string): LenderNoteId {
  return value as LenderNoteId;
}

export function borrowerNoteIdOf(value: string): BorrowerNoteId {
  return value as BorrowerNoteId;
}

export function liquidationIdOf(value: string): LiquidationId {
  return value as LiquidationId;
}

export function fundsHoldIdOf(value: string): FundsHoldId {
  return value as FundsHoldId;
}

export function sessionIdOf(value: string): SessionId {
  return value as SessionId;
}
