import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RateHistory } from './rate-history';

const points = [
  { atEpochMs: 1_000, basisPoints: 1200 },
  { atEpochMs: 2_000, basisPoints: 1180 },
  { atEpochMs: 3_000, basisPoints: 1120 },
];

function pathOf(container: HTMLElement): string {
  return container.querySelector('path')?.getAttribute('d') ?? '';
}

describe('RateHistory', () => {
  /* A smoothed curve would draw rates between two offers that nobody ever
     quoted. Every segment is horizontal or vertical, so the only rates on
     the chart are rates that were actually offered. */
  it('steps rather than sloping', () => {
    const { container } = render(<RateHistory points={points} role="borrower" />);
    const commands = pathOf(container)
      .split(' ')
      .filter((token) => /^[MHV]$/.test(token));
    expect(commands[0]).toBe('M');
    expect(commands.slice(1).every((command) => command === 'H' || command === 'V')).toBe(true);
  });

  it('holds the last rate out to the right edge', () => {
    const { container } = render(<RateHistory points={points} role="borrower" />);
    expect(pathOf(container).endsWith('H 200')).toBe(true);
  });

  it('draws one step per offer after the first', () => {
    const { container } = render(<RateHistory points={points} role="borrower" />);
    const path = pathOf(container);
    expect((path.match(/V /g) ?? []).length).toBe(points.length - 1);
  });

  /* An SVG polyline says nothing to a screen reader, so the figure carries
     the story in words. */
  it('names the first and last rate for a screen reader', () => {
    render(<RateHistory points={points} role="borrower" />);
    const chart = screen.getByRole('img');
    expect(chart.getAttribute('aria-label')).toContain('12.00% p.a.');
    expect(chart.getAttribute('aria-label')).toContain('11.20% p.a.');
  });

  it('takes its tone from the reader', () => {
    const { container, unmount } = render(<RateHistory points={points} role="borrower" />);
    expect(container.querySelector('svg')?.getAttribute('class')).toContain(
      'text-market-favourable',
    );
    unmount();

    const lender = render(<RateHistory points={points} role="lender" />);
    expect(lender.container.querySelector('svg')?.getAttribute('class')).toContain(
      'text-market-adverse',
    );
  });

  it('marks the offer the reader selected in the book', () => {
    const { container } = render(
      <RateHistory points={points} role="borrower" highlightAtEpochMs={2_000} />,
    );
    expect(container.querySelector('circle')).toBeTruthy();
  });

  it('marks nothing when no offer is selected', () => {
    const { container } = render(<RateHistory points={points} role="borrower" />);
    expect(container.querySelector('circle')).toBeNull();
  });

  it('refuses to draw an axis from a single point', () => {
    render(<RateHistory points={[{ atEpochMs: 1_000, basisPoints: 1200 }]} role="borrower" />);
    expect(screen.getByText('No rate history yet')).toBeTruthy();
    expect(screen.getByText(/undercuts it/i)).toBeTruthy();
  });

  it('says a line is coming when there are no offers at all', () => {
    render(<RateHistory points={[]} role="borrower" />);
    expect(screen.getByText(/start competing/i)).toBeTruthy();
  });

  it('survives every offer arriving at the same instant', () => {
    const { container } = render(
      <RateHistory
        points={[
          { atEpochMs: 1_000, basisPoints: 1200 },
          { atEpochMs: 1_000, basisPoints: 1120 },
        ]}
        role="borrower"
      />,
    );
    expect(pathOf(container)).not.toContain('NaN');
  });

  it('survives every offer quoting the same rate', () => {
    const { container } = render(
      <RateHistory
        points={[
          { atEpochMs: 1_000, basisPoints: 1200 },
          { atEpochMs: 2_000, basisPoints: 1200 },
        ]}
        role="borrower"
      />,
    );
    expect(pathOf(container)).not.toContain('NaN');
  });
});
