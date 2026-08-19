import { Injectable } from '@nestjs/common';
import type { ItemCategory } from '../../../domain/custody/item-category';
import type {
  CategoryIndexEntry,
  MarketQueries,
  TapeEvent,
  TapeEventKind,
} from '../../../domain/ports/market-queries.port';
import { listingIdOf } from '../../../domain/shared/identifiers';
import { Instant } from '../../../domain/shared/instant';
import { Money, currencyOf } from '../../../domain/shared/money';
import { PrismaService } from '../prisma.service';

interface IndexRow {
  readonly item_category: ItemCategory;
  readonly live_listings: bigint;
  readonly average_rate: number | null;
  readonly previous_average_rate: number | null;
}

interface TapeRow {
  readonly at: Date;
  readonly kind: TapeEventKind;
  readonly listing_id: string;
  readonly item_description: string;
  readonly item_category: ItemCategory;
  readonly rate_basis_points: number;
  readonly amount_minor_units: bigint;
  readonly currency: string;
}

/* The tape is capped in the adapter as well as at the controller. A limit
   only enforced at the edge is a limit one new caller forgets. */
const maximumTapeEvents = 100;

@Injectable()
export class PrismaMarketQueries implements MarketQueries {
  constructor(private readonly prisma: PrismaService) {}

  /* One row per category that currently has a live listing. The average is
     taken over each listing's best pending offer rather than over every
     offer, because ten lenders queuing behind one cheap offer do not make
     the category dearer; what a borrower would pay is the best of them.

     A category with live listings and no offers reports a null rate. Zero
     would read as free money. */
  async categoryIndex(now: Instant, windowMs: bigint): Promise<readonly CategoryIndexEntry[]> {
    const nowDate = new Date(Number(now.epochMilliseconds));
    const sinceDate = new Date(Number(now.epochMilliseconds - windowMs));

    const rows = await this.prisma.$queryRaw<IndexRow[]>`
      WITH live AS (
        SELECT l.id, r.item_category
        FROM listing l
        JOIN custody_receipt r ON r.id = l.receipt_id
        WHERE l.status = 'ACTIVE' AND l.expires_at > ${nowDate}
      ),
      best AS (
        SELECT live.id, live.item_category,
               MIN(o.annual_percentage_rate_basis_points) AS rate
        FROM live
        JOIN offer o ON o.listing_id = live.id AND o.status = 'PENDING'
        GROUP BY live.id, live.item_category
      ),
      best_before AS (
        SELECT live.id, live.item_category,
               MIN(o.annual_percentage_rate_basis_points) AS rate
        FROM live
        JOIN offer o ON o.listing_id = live.id AND o.status = 'PENDING'
          AND o.offered_at <= ${sinceDate}
        GROUP BY live.id, live.item_category
      )
      SELECT live.item_category,
             COUNT(DISTINCT live.id) AS live_listings,
             AVG(best.rate) AS average_rate,
             AVG(best_before.rate) AS previous_average_rate
      FROM live
      LEFT JOIN best ON best.id = live.id
      LEFT JOIN best_before ON best_before.id = live.id
      GROUP BY live.item_category
      ORDER BY live.item_category
    `;

    return rows.map((row) => ({
      category: row.item_category,
      liveListings: Number(row.live_listings),
      averageRateBasisPoints: roundedOrNull(row.average_rate),
      previousAverageRateBasisPoints: roundedOrNull(row.previous_average_rate),
    }));
  }

  /* Offers placed and loans originated, newest first, across every listing.

     Only listings that are or were publicly browsable appear. A draft or a
     cancelled listing never reaches the tape, so the tape cannot be read as
     a directory of what exists. */
  async recentActivity(limit: number): Promise<readonly TapeEvent[]> {
    const capped = Math.max(1, Math.min(limit, maximumTapeEvents));

    const rows = await this.prisma.$queryRaw<TapeRow[]>`
      (
        SELECT o.offered_at AS at,
               'OFFER_PLACED' AS kind,
               l.id AS listing_id,
               r.item_description,
               r.item_category,
               o.annual_percentage_rate_basis_points AS rate_basis_points,
               o.principal_minor_units AS amount_minor_units,
               o.currency
        FROM offer o
        JOIN listing l ON l.id = o.listing_id
        JOIN custody_receipt r ON r.id = l.receipt_id
        WHERE l.status IN ('ACTIVE', 'MATCHED')
      )
      UNION ALL
      (
        SELECT loan.started_at AS at,
               'LOAN_ORIGINATED' AS kind,
               l.id AS listing_id,
               r.item_description,
               r.item_category,
               loan.annual_percentage_rate_basis_points AS rate_basis_points,
               loan.principal_minor_units AS amount_minor_units,
               loan.currency
        FROM loan
        JOIN custody_receipt r ON r.id = loan.receipt_id
        JOIN listing l ON l.receipt_id = r.id AND l.status = 'MATCHED'
      )
      ORDER BY at DESC
      LIMIT ${capped}
    `;

    return rows.map((row) => ({
      at: Instant.fromEpochMilliseconds(BigInt(row.at.getTime())),
      kind: row.kind,
      listingId: listingIdOf(row.listing_id),
      itemDescription: row.item_description,
      itemCategory: row.item_category,
      rateBasisPoints: row.rate_basis_points,
      amount: Money.of(row.amount_minor_units, currencyOf(row.currency)),
    }));
  }
}

/* Postgres AVG returns a numeric, which arrives as a string or a number
   depending on the driver, and null when every row it saw was null. Basis
   points are integers all the way through the domain, so the mean is rounded
   here rather than leaked as a fraction of a basis point. */
function roundedOrNull(value: number | null): number | null {
  if (value === null) {
    return null;
  }
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? Math.round(asNumber) : null;
}
