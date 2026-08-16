import type { ProtocolParameters } from '../marketplace/protocol-parameters';
import { platformAccountIds } from '../ledger/platform-accounts';
import type { AccountId } from '../shared/identifiers';
import { Money } from '../shared/money';
import type { Distribution } from '../shared/settlement-ref';

export interface WaterfallRecipients {
  readonly noteHolder: AccountId;
  readonly borrower: AccountId;
}

/* Rule L7 and docs/10 flow 8: proceeds are split strictly in this order, the
   surplus always goes back to the borrower, and the rounding line is present
   even when it is zero because docs/03 forbids omitting it. Every branch is
   integer arithmetic on minor units, so the only way the parts can fail to
   equal the whole is a bug, and the last line is what proves they do. */
export function distributeLiquidationProceeds(
  proceeds: Money,
  amountOwedToLender: Money,
  recipients: WaterfallRecipients,
  parameters: ProtocolParameters,
): Distribution[] {
  const currency = proceeds.currency;
  const toLender = proceeds.isLessThan(amountOwedToLender) ? proceeds : amountOwedToLender;
  const remainder = proceeds.minus(toLender);

  // A loss leaves nothing to take a fee on, and no surplus to return.
  const fee = remainder.multiplyByBasisPoints(parameters.liquidationFeeBasisPoints);
  const surplus = remainder.minus(fee);

  const distributions: Distribution[] = [
    { accountId: recipients.noteHolder, amount: toLender },
    { accountId: platformAccountIds.feeRevenue, amount: fee },
    { accountId: recipients.borrower, amount: surplus },
  ];

  const allocated = distributions.reduce(
    (total, distribution) => total.plus(distribution.amount),
    Money.zero(currency),
  );
  distributions.push({
    accountId: platformAccountIds.rounding,
    amount: proceeds.minus(allocated),
  });
  return distributions;
}
