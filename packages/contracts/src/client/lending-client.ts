import { loanResponseSchema, myLoansResponseSchema } from '../lending';
import type { LoanResponse, LoanRole, MyLoansResponse } from '../lending';
import { requestJson } from './http';
import type { RequestOptions } from './http';

const basePath = '/api/v1';

export function acceptOffer(
  listingId: string,
  offerId: string,
  options: RequestOptions,
): Promise<LoanResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/listings/${listingId}/offers/${offerId}/accept`,
    body: {},
    options,
    responseSchema: loanResponseSchema,
  });
}

export function fetchMyLoans(role: LoanRole): Promise<MyLoansResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/me/loans?role=${role}`,
    responseSchema: myLoansResponseSchema,
  });
}

export function fetchLoan(loanId: string): Promise<LoanResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/loans/${loanId}`,
    responseSchema: loanResponseSchema,
  });
}
