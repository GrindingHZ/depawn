import { Injectable } from '@nestjs/common';
import type { ItemCategory } from '../../../domain/custody/item-category';
import type { ListingStatus } from '../../../domain/marketplace/listing';
import type { Offer } from '../../../domain/marketplace/offer';
import type {
  ListingsPage,
  ListingSummaryReadModel,
  MarketplaceQueries,
} from '../../../domain/ports/marketplace-queries.port';
import { accountIdOf, listingIdOf, receiptIdOf } from '../../../domain/shared/identifiers';
import type { AccountId } from '../../../domain/shared/identifiers';
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
}

@Injectable()
export class PrismaMarketplaceQueries implements MarketplaceQueries {
  constructor(private readonly prisma: PrismaService) {}

  async browseActive(cursor: string | null, limit: number, now: Instant): Promise<ListingsPage> {
    const nowDate = new Date(Number(now.epochMilliseconds));
    const rows = await this.prisma.$queryRaw<BrowseRow[]>`
      SELECT l.id, l.borrower_account_id, l.receipt_id, l.requested_principal_minor_units,
             l.currency, l.max_annual_percentage_rate_basis_points, l.requested_duration_ms,
             l.expires_at, l.status, r.appraised_value_minor_units, r.item_category
      FROM listing l
      JOIN custody_receipt r ON r.id = l.receipt_id
      WHERE l.status = 'ACTIVE'
        AND l.expires_at > ${nowDate}
        AND (${cursor}::text IS NULL OR l.id < ${cursor})
      ORDER BY l.id DESC
      LIMIT ${limit + 1}
    `;

    const page = rows.slice(0, limit);
    return {
      items: page.map(toSummary),
      nextCursor: rows.length > limit ? (page[page.length - 1]?.id ?? null) : null,
    };
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
  };
}
