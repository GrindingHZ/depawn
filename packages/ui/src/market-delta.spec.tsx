import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarketDelta, directionOf, toneFor } from './market-delta';

describe('directionOf', () => {
  it('reads the sign and nothing else', () => {
    expect(directionOf(1120, 1200)).toBe('down');
    expect(directionOf(1200, 1120)).toBe('up');
    expect(directionOf(1120, 1120)).toBe('flat');
  });

  it('has no direction without a previous figure', () => {
    expect(directionOf(1120, null)).toBe('flat');
  });
});

describe('toneFor', () => {
  /* The whole reason this function exists. A borrower and a lender read the
     same falling rate as opposite news, so the tone cannot be derived from
     the arithmetic alone. */
  it('reads a falling rate as favourable to the borrower and adverse to the lender', () => {
    expect(toneFor('down', 'borrower')).toBe('favourable');
    expect(toneFor('down', 'lender')).toBe('adverse');
  });

  it('inverts both when the rate rises', () => {
    expect(toneFor('up', 'borrower')).toBe('adverse');
    expect(toneFor('up', 'lender')).toBe('favourable');
  });

  it('is flat for both when nothing moved', () => {
    expect(toneFor('flat', 'borrower')).toBe('flat');
    expect(toneFor('flat', 'lender')).toBe('flat');
  });
});

describe('MarketDelta', () => {
  it('renders the same figure to both sides', () => {
    const { unmount } = render(
      <MarketDelta currentBasisPoints={1120} previousBasisPoints={1200} role="borrower" />,
    );
    expect(screen.getByText('11.20%')).toBeTruthy();
    unmount();

    render(<MarketDelta currentBasisPoints={1120} previousBasisPoints={1200} role="lender" />);
    expect(screen.getByText('11.20%')).toBeTruthy();
  });

  it('paints one falling rate two ways', () => {
    const { container, unmount } = render(
      <MarketDelta currentBasisPoints={1120} previousBasisPoints={1200} role="borrower" />,
    );
    expect(container.querySelector('[data-tone="favourable"]')).toBeTruthy();
    unmount();

    const lender = render(
      <MarketDelta currentBasisPoints={1120} previousBasisPoints={1200} role="lender" />,
    );
    expect(lender.container.querySelector('[data-tone="adverse"]')).toBeTruthy();
  });

  it('points the arrow by arithmetic, so both sides see it pointing the same way', () => {
    const { container, unmount } = render(
      <MarketDelta currentBasisPoints={1120} previousBasisPoints={1200} role="borrower" />,
    );
    const borrowerArrow = container
      .querySelector('[data-direction]')
      ?.getAttribute('data-direction');
    unmount();

    const lender = render(
      <MarketDelta currentBasisPoints={1120} previousBasisPoints={1200} role="lender" />,
    );
    expect(lender.container.querySelector('[data-direction]')?.getAttribute('data-direction')).toBe(
      borrowerArrow,
    );
    expect(borrowerArrow).toBe('down');
  });

  /* Rule 3 in docs/DESIGN-BRIEF.md: colour is never the only signal. A reader
     who cannot separate the two greens still gets told what happened. */
  it('says what happened in words for a screen reader', () => {
    render(<MarketDelta currentBasisPoints={1120} previousBasisPoints={1200} role="lender" />);
    expect(screen.getByText(/undercut/i)).toBeTruthy();
  });

  it('renders flat with no arrow when there is nothing to compare against', () => {
    const { container } = render(
      <MarketDelta currentBasisPoints={1120} previousBasisPoints={null} role="borrower" />,
    );
    expect(container.querySelector('[data-tone="flat"]')).toBeTruthy();
    expect(container.querySelector('[data-direction="flat"]')).toBeTruthy();
  });

  it('takes a label for the figure it is describing', () => {
    render(
      <MarketDelta
        currentBasisPoints={1120}
        previousBasisPoints={1200}
        role="borrower"
        label="best rate offered"
      />,
    );
    expect(screen.getByText('best rate offered')).toBeTruthy();
  });
});

describe('MarketDelta, compact', () => {
  it('prints one line and speaks the rest', () => {
    const { container } = render(
      <MarketDelta compact currentBasisPoints={1120} previousBasisPoints={1200} role="lender" />,
    );
    expect(container.querySelector('[data-tone="adverse"]')).toBeTruthy();
    expect(screen.getByText('11.20%')).toBeTruthy();
    /* Still announced, just not printed: a strip has no room for a sentence
       under every figure, and dropping it entirely would leave colour as the
       only signal. */
    expect(screen.getByText(/undercut/i)).toBeTruthy();
  });

  it('keeps the tone rule in compact form', () => {
    const { container } = render(
      <MarketDelta compact currentBasisPoints={1120} previousBasisPoints={1200} role="borrower" />,
    );
    expect(container.querySelector('[data-tone="favourable"]')).toBeTruthy();
  });
});
