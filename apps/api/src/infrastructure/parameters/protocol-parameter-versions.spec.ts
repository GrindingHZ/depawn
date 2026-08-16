import { describe, expect, it } from 'vitest';
import { Instant } from '../../domain/shared/instant';
import { Money, currencyOf } from '../../domain/shared/money';
import { demoParameters } from './demo-parameters';
import {
  fromStoredParameters,
  toStoredParameters,
  versionInForce,
} from './protocol-parameter-versions';
import type { ParameterVersion } from './protocol-parameter-versions';

const oneDay = 24n * 60n * 60n * 1000n;
const day1 = Instant.fromEpochMilliseconds(1_700_000_000_000n);

function versionAt(id: string, effectiveAt: Instant, fee: number): ParameterVersion {
  return {
    id,
    effectiveAt,
    writtenByAccountId: 'OPS-1',
    parameters: { ...demoParameters, originationFeeBasisPoints: fee },
  };
}

describe('versionInForce', () => {
  it('falls back to the defaults before anyone has written a version', () => {
    expect(versionInForce([], day1, demoParameters).originationFeeBasisPoints).toBe(
      demoParameters.originationFeeBasisPoints,
    );
  });

  it('applies a version from the instant it takes effect', () => {
    const versions = [versionAt('V1', day1, 300)];
    expect(
      versionInForce(versions, day1.plusMilliseconds(-1n), demoParameters)
        .originationFeeBasisPoints,
    ).toBe(demoParameters.originationFeeBasisPoints);
    expect(versionInForce(versions, day1, demoParameters).originationFeeBasisPoints).toBe(300);
  });

  it('leaves a future version waiting', () => {
    const versions = [
      versionAt('V1', day1, 300),
      versionAt('V2', day1.plusMilliseconds(oneDay), 400),
    ];
    expect(
      versionInForce(versions, day1.plusMilliseconds(oneDay - 1n), demoParameters)
        .originationFeeBasisPoints,
    ).toBe(300);
    expect(
      versionInForce(versions, day1.plusMilliseconds(oneDay), demoParameters)
        .originationFeeBasisPoints,
    ).toBe(400);
  });

  it('takes the newest applicable version whatever order they arrive in', () => {
    const versions = [
      versionAt('V2', day1.plusMilliseconds(oneDay), 400),
      versionAt('V1', day1, 300),
    ];
    expect(
      versionInForce(versions, day1.plusMilliseconds(2n * oneDay), demoParameters)
        .originationFeeBasisPoints,
    ).toBe(400);
  });
});

describe('parameter storage', () => {
  it('round trips bigints and money through json without losing them', () => {
    const original = {
      ...demoParameters,
      minimumOfferLifetimeMs: 900_000n,
      dualAppraisalThreshold: Money.of(12_345_678n, currencyOf('AUD')),
    };
    const restored = fromStoredParameters(toStoredParameters(original));
    expect(restored.minimumOfferLifetimeMs).toBe(900_000n);
    expect(restored.dualAppraisalThreshold.minorUnits).toBe(12_345_678n);
    expect(restored.gracePeriodMs).toBe(demoParameters.gracePeriodMs);
    expect(restored.maxLoanToValueBasisPointsByCategory.BULLION).toBe(6000);
    expect(restored.notesTransferable).toBe(false);
  });
});
