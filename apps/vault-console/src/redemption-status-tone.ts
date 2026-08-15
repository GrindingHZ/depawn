import type { RedemptionStatusDto } from '@depawn/contracts';
import type { StatusTone } from '@depawn/ui';

/* Work waiting at the counter reads as active until the item has left, and
   the switch is exhaustive so a new status cannot ship without a tone. */
export function redemptionStatusTone(status: RedemptionStatusDto): StatusTone {
  switch (status) {
    case 'REQUESTED':
      return 'active';
    case 'VERIFIED':
      return 'warning';
    case 'RELEASED':
      return 'success';
  }
}
