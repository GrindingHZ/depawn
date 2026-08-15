import { Injectable } from '@nestjs/common';
import type { Listing } from '../../../domain/marketplace/listing';
import type { ListingRepository } from '../../../domain/marketplace/listing-repository';
import type { UnitOfWorkContext } from '../../../domain/ports/unit-of-work';
import type { AccountId, ListingId, ReceiptId } from '../../../domain/shared/identifiers';
import { toListing, toListingRow, toOfferRow } from '../mappers/marketplace.mapper';
import { transactionOf } from '../prisma-unit-of-work';

export class StaleListingVersionError extends Error {
  constructor(listingId: string) {
    super(`Listing ${listingId} was modified concurrently`);
    this.name = 'StaleListingVersionError';
  }
}

@Injectable()
export class PrismaListingRepository implements ListingRepository {
  async findById(id: ListingId, context: UnitOfWorkContext): Promise<Listing | null> {
    const row = await transactionOf(context).listing.findUnique({
      where: { id },
      include: { offers: { orderBy: { id: 'asc' } } },
    });
    return row === null ? null : toListing(row);
  }

  async findLiveByReceipt(
    receiptId: ReceiptId,
    context: UnitOfWorkContext,
  ): Promise<Listing | null> {
    const row = await transactionOf(context).listing.findFirst({
      where: { receiptId, status: { in: ['DRAFT', 'ACTIVE'] } },
      include: { offers: { orderBy: { id: 'asc' } } },
    });
    return row === null ? null : toListing(row);
  }

  async listByBorrower(
    borrower: AccountId,
    context: UnitOfWorkContext,
  ): Promise<readonly Listing[]> {
    const rows = await transactionOf(context).listing.findMany({
      where: { borrowerAccountId: borrower },
      include: { offers: { orderBy: { id: 'asc' } } },
      orderBy: { id: 'desc' },
    });
    return rows.map(toListing);
  }

  async lock(id: ListingId, context: UnitOfWorkContext): Promise<void> {
    await transactionOf(context).$queryRaw`SELECT id FROM listing WHERE id = ${id} FOR UPDATE`;
  }

  async save(listing: Listing, context: UnitOfWorkContext): Promise<void> {
    const transaction = transactionOf(context);
    const row = toListingRow(listing);
    const existing = await transaction.listing.findUnique({ where: { id: listing.id } });

    if (existing === null) {
      await transaction.listing.create({ data: { ...row, version: 0 } });
    } else {
      const updated = await transaction.listing.updateMany({
        where: { id: listing.id, version: listing.version },
        data: { ...row, version: listing.version + 1 },
      });
      if (updated.count === 0) {
        throw new StaleListingVersionError(listing.id);
      }
    }

    for (const offer of listing.offers) {
      const offerRow = toOfferRow(offer);
      await transaction.offer.upsert({
        where: { id: offer.id },
        update: { status: offerRow.status },
        create: offerRow,
      });
    }
  }
}
