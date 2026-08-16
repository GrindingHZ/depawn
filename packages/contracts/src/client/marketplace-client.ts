import {
  listingDetailResponseSchema,
  listingResponseSchema,
  listingsPageResponseSchema,
  myListingsResponseSchema,
  myOffersResponseSchema,
  offerResponseSchema,
} from '../marketplace';
import type {
  CreateListingRequest,
  ListingDetailResponse,
  ListingResponse,
  ListingsPageResponse,
  MyListingsResponse,
  MyOffersResponse,
  OfferResponse,
  PlaceOfferRequest,
} from '../marketplace';
import { settlementResponseSchema } from '../wallet';
import type { SettlementResponse } from '../wallet';
import { requestJson } from './http';
import type { RequestOptions } from './http';

const basePath = '/api/v1';

export function createListing(
  body: CreateListingRequest,
  options: RequestOptions,
): Promise<ListingResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/listings`,
    body,
    options,
    responseSchema: listingResponseSchema,
  });
}

export function publishListing(
  listingId: string,
  options: RequestOptions,
): Promise<ListingResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/listings/${listingId}/publish`,
    body: {},
    options,
    responseSchema: listingResponseSchema,
  });
}

export function cancelListing(
  listingId: string,
  options: RequestOptions,
): Promise<ListingResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/listings/${listingId}/cancel`,
    body: {},
    options,
    responseSchema: listingResponseSchema,
  });
}

export interface BrowseOptions {
  readonly cursor?: string;
  readonly category?: string;
  readonly maxLoanToValueBasisPoints?: number;
  readonly sort?: 'newest' | 'rate' | 'closing';
}

export function browseListings(options: BrowseOptions = {}): Promise<ListingsPageResponse> {
  const query = new URLSearchParams();
  if (options.cursor !== undefined) {
    query.set('cursor', options.cursor);
  }
  if (options.category !== undefined) {
    query.set('category', options.category);
  }
  if (options.maxLoanToValueBasisPoints !== undefined) {
    query.set('maxLoanToValueBasisPoints', String(options.maxLoanToValueBasisPoints));
  }
  if (options.sort !== undefined && options.sort !== 'newest') {
    query.set('sort', options.sort);
  }
  const suffix = query.size === 0 ? '' : `?${query.toString()}`;
  return requestJson({
    method: 'GET',
    path: `${basePath}/listings${suffix}`,
    responseSchema: listingsPageResponseSchema,
  });
}

export function fetchListing(listingId: string): Promise<ListingDetailResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/listings/${listingId}`,
    responseSchema: listingDetailResponseSchema,
  });
}

export function fetchMyListings(): Promise<MyListingsResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/me/listings`,
    responseSchema: myListingsResponseSchema,
  });
}

export function placeOffer(
  listingId: string,
  body: PlaceOfferRequest,
  options: RequestOptions,
): Promise<OfferResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/listings/${listingId}/offers`,
    body,
    options,
    responseSchema: offerResponseSchema,
  });
}

export function withdrawOffer(
  listingId: string,
  offerId: string,
  options: RequestOptions,
): Promise<SettlementResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/listings/${listingId}/offers/${offerId}/withdraw`,
    body: {},
    options,
    responseSchema: settlementResponseSchema,
  });
}

export function fetchMyOffers(): Promise<MyOffersResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/me/offers`,
    responseSchema: myOffersResponseSchema,
  });
}

export function reclaimOffer(
  offerId: string,
  options: RequestOptions,
): Promise<SettlementResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/me/offers/${offerId}/reclaim`,
    body: {},
    options,
    responseSchema: settlementResponseSchema,
  });
}
