import { Injectable } from '@nestjs/common';
import type { ItemCategory } from '../../../domain/custody/item-category';
import type { ListingStatus } from '../../../domain/marketplace/listing';
import type { Offer } from '../../../domain/marketplace/offer';
import type {
  BrowseFilter,
  BrowseSort,
  ListingsPage,
  ListingSummaryReadModel,
  MarketplaceQueries,
} from '../../../domain/ports/marketplace-queries.port';
import { accountIdOf, listingIdOf, receiptIdOf } from '../../../domain/shared/identifiers';
import type { AccountId, ReceiptId } from '../../../domain/shared/identifiers';
import { Instant } from '../../../domain/shared/instant';
import { Money, currencyOf } from '../../../domain/shared/money';
import { toOffer } from '../mappers/marketplace.mapper';
import { PrismaService } from '../prisma.service';

interface BrowseRow {
  readonly id: string;
  readonly borrower_account_id: string;
  readonly receipt_id: string;
  readonly requested_principal_minor_units: bigint;
  readonly currency: string;
  readonly max_annual_percentage_rate_basis_points: number;
  readonly requested_duration_ms: bigint;
  readonly expires_at: Date;
  readonly status: ListingStatus;
  readonly appraised_value_minor_units: bigint;
  readonly item_category: ItemCategory;
  readonly item_description: string;
  readonly has_photograph: boolean;
  readonly best_offer_rate_basis_points: number | null;
}

@Injectable()
export class PrismaMarketplaceQueries implements MarketplaceQueries {
  constructor(private readonly prisma: PrismaService) {}

  /* Filters and sorting run in the database, not over a page already
     fetched. Filtering what happens to have loaded is theatre: it hides rows
     from the reader while telling them they have seen everything.

     The cursor carries the sort value as well as the id, because rate and
     closing time both repeat across listings and a cursor on the id alone
     would skip or repeat rows at a page boundary. Postgres row comparison
     does the work. */
  async browseActive(filter: BrowseFilter): Promise<ListingsPage> {
    const nowDate = new Date(Number(filter.now.epochMilliseconds));
    const cursor = decodeCursor(filter.cursor);
    const rows = await this.prisma.$queryRaw<BrowseRow[]>`
      SELECT l.id, l.borrower_account_id, l.receipt_id, l.requested_principal_minor_units,
             l.currency, l.max_annual_percentage_rate_basis_points, l.requested_duration_ms,
             l.expires_at, l.status, r.appraised_value_minor_units, r.item_category,
             r.item_description,
             -- Any evidence carrying a verified content type is servable.
             -- Evidence written before uploads were checked has none, and the
             -- media endpoint refuses it, so the two agree.
             EXISTS (
               SELECT 1 FROM intake_record i
               WHERE i.sealed_hash = r.intake_record_hash
                 AND jsonb_path_exists(i.evidence, '$[*].contentType')
             ) AS has_photograph,
             -- What a borrower would pay if they took the best offer standing
             -- right now. Computed here so a rail of twenty rows stays one
             -- query rather than becoming twenty.
             (
               SELECT MIN(o.annual_percentage_rate_basis_points)
               FROM offer o
               WHERE o.listing_id = l.id AND o.status = 'PENDING'
             ) AS best_offer_rate_basis_points
      FROM listing l
      JOIN custody_receipt r ON r.id = l.receipt_id
      WHERE l.status = 'ACTIVE'
        AND l.expires_at > ${nowDate}
        AND (${filter.category}::text IS NULL OR r.item_category::text = ${filter.category})
        AND (
          ${filter.maximumLoanToValueBasisPoints}::int IS NULL
          OR r.appraised_value_minor_units > 0
             AND l.requested_principal_minor_units * 10000 / r.appraised_value_minor_units
                 <= ${filter.maximumLoanToValueBasisPoints}
        )
        AND (
          ${cursor.id}::text IS NULL
          OR (${filter.sort} = 'newest' AND l.id < ${cursor.id})
          OR (${filter.sort} = 'rate'
              AND (l.max_annual_percentage_rate_basis_points, l.id) > (${cursor.value}::int, ${cursor.id}))
          OR (${filter.sort} = 'closing'
              AND (l.expires_at, l.id) > (${cursor.at}::timestamp, ${cursor.id}))
        )
      ORDER BY
        CASE WHEN ${filter.sort} = 'newest' THEN l.id END DESC,
        CASE WHEN ${filter.sort} = 'rate' THEN l.max_annual_percentage_rate_basis_points END ASC,
        CASE WHEN ${filter.sort} = 'closing' THEN l.expires_at END ASC,
        l.id ASC
      LIMIT ${filter.limit + 1}
    `;

    const page = rows.slice(0, filter.limit);
    const last = page[page.length - 1];
    return {
      items: page.map(toSummary),
      nextCursor:
        rows.length > filter.limit && last !== undefined ? encodeCursor(filter.sort, last) : null,
    };
  }

  async photographExists(receiptId: ReceiptId): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ present: boolean }[]>`
      SELECT EXISTS (
        SELECT 1
        FROM custody_receipt r
        JOIN intake_record i ON i.sealed_hash = r.intake_record_hash
        WHERE r.id = ${receiptId}
          AND jsonb_path_exists(i.evidence, '$[*].contentType')
      ) AS present
    `;
    return rows[0]?.present ?? false;
  }

  async offersByLender(lender: AccountId): Promise<readonly Offer[]> {
    const rows = await this.prisma.offer.findMany({
      where: { lenderAccountId: lender },
      orderBy: { id: 'desc' },
    });
    return rows.map(toOffer);
  }
}

function toSummary(row: BrowseRow): ListingSummaryReadModel {
  return {
    id: listingIdOf(row.id),
    borrowerAccountId: accountIdOf(row.borrower_account_id),
    receiptId: receiptIdOf(row.receipt_id),
    requestedPrincipal: Money.of(row.requested_principal_minor_units, currencyOf(row.currency)),
    maxAnnualPercentageRateBasisPoints: row.max_annual_percentage_rate_basis_points,
    requestedDurationMs: row.requested_duration_ms,
    expiresAt: Instant.fromEpochMilliseconds(BigInt(row.expires_at.getTime())),
    status: row.status,
    appraisedValue: Money.of(row.appraised_value_minor_units, currencyOf(row.currency)),
    itemCategory: row.item_category,
    itemDescription: row.item_description,
    hasPhotograph: row.has_photograph,
    bestOfferRateBasisPoints: row.best_offer_rate_basis_points,
  };
}

interface DecodedCursor {
  readonly id: string | null;
  readonly value: number | null;
  readonly at: Date | null;
}

/* The cursor is opaque to the client and carries whatever the sort needs to
   resume exactly where it stopped. A malformed one reads as no cursor: a
   reader who has hand edited the query string gets the first page, not an
   error page. */
function decodeCursor(cursor: string | null): DecodedCursor {
  if (cursor === null) {
    return { id: null, value: null, at: null };
  }
  const [id, tail] = cursor.split('|');
  if (id === undefined || id === '') {
    return { id: null, value: null, at: null };
  }
  const numeric = tail === undefined ? Number.NaN : Number(tail);
  const at = tail === undefined ? Number.NaN : Date.parse(tail);
  return {
    id,
    value: Number.isNaN(numeric) ? null : numeric,
    at: Number.isNaN(at) ? null : new Date(at),
  };
}

function encodeCursor(sort: BrowseSort, row: BrowseRow): string {
  if (sort === 'rate') {
    return `${row.id}|${row.max_annual_percentage_rate_basis_points}`;
  }
  if (sort === 'closing') {
    return `${row.id}|${row.expires_at.toISOString()}`;
  }
  return row.id;
}
