import { describe, expect, it } from 'vitest';
import {
  accountIdOf,
  receiptIdOf,
  redemptionRequestIdOf,
  staffIdOf,
  vaultIdOf,
} from '../shared/identifiers';
import { Instant } from '../shared/instant';
import { RedemptionRequest, allowedRedemptionTransitions } from './redemption-request';
import type { RedemptionEvent, RedemptionStatus } from './redemption-request';

const requestedAt = Instant.fromEpochMilliseconds(1_700_000_000_000n);
const staffId = staffIdOf('STAFF-1');

function opened(): RedemptionRequest {
  return RedemptionRequest.open({
    id: redemptionRequestIdOf('RR-1'),
    receiptId: receiptIdOf('RCP-1'),
    vaultId: vaultIdOf('VAULT-1'),
    requestedByAccountId: accountIdOf('BORROWER-1'),
    requestedAt,
  });
}

describe('RedemptionRequest', () => {
  it('opens in REQUESTED with nothing recorded at the counter', () => {
    const request = opened();
    expect(request.status).toBe('REQUESTED');
    expect(request.verifiedAt).toBeNull();
    expect(request.verifiedByStaffId).toBeNull();
    expect(request.releasedAt).toBeNull();
    expect(request.sealNumberBroken).toBeNull();
  });

  it('records who verified and when', () => {
    const verifiedAt = requestedAt.plusMilliseconds(3_600_000n);
    const result = opened().verify(staffId, verifiedAt);
    if (!result.ok) {
      throw new Error('a fresh request must be verifiable');
    }
    expect(result.value.status).toBe('VERIFIED');
    expect(result.value.verifiedByStaffId).toBe('STAFF-1');
    expect(result.value.verifiedAt?.equals(verifiedAt)).toBe(true);
  });

  it('refuses a handover before verification', () => {
    const result = opened().release(staffId, 'SEAL-9', requestedAt);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('REDEMPTION_NOT_VERIFIED');
    }
  });

  it('records the seal broken at handover', () => {
    const verified = opened().verify(staffId, requestedAt);
    if (!verified.ok) {
      throw new Error('a fresh request must be verifiable');
    }
    const releasedAt = requestedAt.plusMilliseconds(600_000n);
    const released = verified.value.release(staffIdOf('STAFF-2'), 'SEAL-9', releasedAt);
    if (!released.ok) {
      throw new Error('a verified request must be releasable');
    }
    expect(released.value.status).toBe('RELEASED');
    expect(released.value.sealNumberBroken).toBe('SEAL-9');
    expect(released.value.releasedByStaffId).toBe('STAFF-2');
    // The verification stays on the record; a dispute needs both events.
    expect(released.value.verifiedByStaffId).toBe('STAFF-1');
  });

  it('refuses a second handover', () => {
    const verified = opened().verify(staffId, requestedAt);
    if (!verified.ok) {
      throw new Error('a fresh request must be verifiable');
    }
    const released = verified.value.release(staffId, 'SEAL-9', requestedAt);
    if (!released.ok) {
      throw new Error('a verified request must be releasable');
    }
    const again = released.value.release(staffId, 'SEAL-9', requestedAt);
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.error.code).toBe('REDEMPTION_ALREADY_RELEASED');
    }
  });

  it('refuses a second verification', () => {
    const verified = opened().verify(staffId, requestedAt);
    if (!verified.ok) {
      throw new Error('a fresh request must be verifiable');
    }
    const again = verified.value.verify(staffId, requestedAt);
    expect(again.ok).toBe(false);
  });
});

describe('allowedRedemptionTransitions', () => {
  const everyEvent: readonly RedemptionEvent[] = ['verify', 'release'];
  const expected: Record<RedemptionStatus, readonly RedemptionEvent[]> = {
    REQUESTED: ['verify'],
    VERIFIED: ['release'],
    RELEASED: [],
  };

  it.each(Object.entries(expected))('%s allows exactly %j', (status, events) => {
    const request = RedemptionRequest.restore({
      id: redemptionRequestIdOf('RR-1'),
      receiptId: receiptIdOf('RCP-1'),
      vaultId: vaultIdOf('VAULT-1'),
      requestedByAccountId: accountIdOf('BORROWER-1'),
      requestedAt,
      status: status as RedemptionStatus,
      verifiedAt: null,
      verifiedByStaffId: null,
      releasedAt: null,
      releasedByStaffId: null,
      sealNumberBroken: null,
    });
    for (const event of everyEvent) {
      expect(request.allows(event)).toBe(events.includes(event));
    }
    expect(allowedRedemptionTransitions[status as RedemptionStatus]).toEqual(events);
  });
});
