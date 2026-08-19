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

describe('RateHistory geometry', () => {
  /* A falling rate has to draw a falling line. Getting this backwards shows
     the borrower a rising chart while their cost improves. */
  it('descends as the rate falls', () => {
    const { container } = render(<RateHistory points={points} role="borrower" />);
    const path = pathOf(container);
    const verticals = [...path.matchAll(/V ([\d.]+)/g)].map((match) => Number(match[1]));
    expect(verticals.length).toBeGreaterThan(0);
    expect(verticals).toEqual([...verticals].sort((left, right) => left - right));
  });

  /* Only the vertical extent can clip. A horizontal segment starting at x=0
     is the left edge of the box and is meant to be there. */
  it('keeps the line clear of the top and bottom edges', () => {
    const { container } = render(<RateHistory points={points} role="borrower" />);
    const path = pathOf(container);
    const start = /^M [\d.]+ ([\d.]+)/.exec(path);
    const heights = [
      Number(start?.[1] ?? 0),
      ...[...path.matchAll(/V ([\d.]+)/g)].map((match) => Number(match[1])),
    ];
    expect(Math.min(...heights)).toBeGreaterThan(0);
    expect(Math.max(...heights)).toBeLessThan(60);
  });
});

describe('RateHistory hold run', () => {
  /* The most recent step is the one a reader most wants to see, and mapping
     the last point to the right edge is what hides it. */
  it('leaves the last step clear of the right edge', () => {
    const { container } = render(<RateHistory points={points} role="borrower" />);
    const path = pathOf(container);
    const horizontals = [...path.matchAll(/H ([\d.]+)/g)].map((match) => Number(match[1]));
    const beforeHold = horizontals[horizontals.length - 2];
    expect(beforeHold).toBeLessThan(200);
    expect(horizontals[horizontals.length - 1]).toBe(200);
  });
});
