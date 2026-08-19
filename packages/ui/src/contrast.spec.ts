import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/* docs/DESIGN-BRIEF.md records a contrast ratio for every text and background
   pair. A table in a document drifts from the stylesheet the moment somebody
   nudges a value, so the ratios are computed here from the tokens themselves.
   Nothing in this file names a colour: every value is read out of tokens.css,
   which is also what keeps the file clear of the raw hex that
   scripts/check-design-tokens.sh forbids everywhere else. */

const stylesheet = readFileSync(resolve(process.cwd(), 'src/tokens.css'), 'utf8');

function scopeBody(selector: string): string {
  const start = stylesheet.indexOf(selector);
  if (start === -1) {
    throw new Error(`no ${selector} block in tokens.css`);
  }
  const open = stylesheet.indexOf('{', start);
  const close = stylesheet.indexOf('}', open);
  return stylesheet.slice(open + 1, close);
}

function tokensOf(selector: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const line of scopeBody(selector).split('\n')) {
    const match = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/.exec(line);
    const [, name, value] = match ?? [];
    if (name !== undefined && value !== undefined) {
      found.set(name, value.trim());
    }
  }
  return found;
}

function channel(value: number): number {
  const proportion = value / 255;
  return proportion <= 0.03928 ? proportion / 12.92 : Math.pow((proportion + 0.055) / 1.055, 2.4);
}

function luminanceOf(colour: string): number {
  const [, digits] = /^#([0-9a-fA-F]{6})$/.exec(colour) ?? [];
  if (digits === undefined) {
    throw new Error(`expected a six digit hex colour, read ${colour}`);
  }
  const packed = Number.parseInt(digits, 16);
  return (
    0.2126 * channel((packed >> 16) & 255) +
    0.7152 * channel((packed >> 8) & 255) +
    0.0722 * channel(packed & 255)
  );
}

function ratioOf(foreground: string, background: string): number {
  const first = luminanceOf(foreground);
  const second = luminanceOf(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

const surfaces = ['--color-surface-base', '--color-surface-raised', '--color-surface-sunken'];

/* AA for body text. Anything carrying a figure a person acts on is body text,
   whatever its size. */
const textTokens = [
  '--color-text-primary',
  '--color-text-secondary',
  '--color-accent-default',
  '--color-accent-hover',
  '--color-status-active',
  '--color-status-warning',
  '--color-status-danger',
  '--color-status-neutral',
  '--color-market-favourable',
  '--color-market-adverse',
  '--color-market-flat',
];

describe('the floor palette', () => {
  const floor = tokensOf("[data-surface='floor']");

  it('defines every surface, text and market token', () => {
    for (const token of [...surfaces, ...textTokens, '--color-border', '--color-border-strong']) {
      expect(floor.get(token), `${token} missing from the floor scope`).toBeDefined();
    }
  });

  it.each(textTokens)('reads %s against every surface at AA', (token) => {
    for (const surface of surfaces) {
      const measured = ratioOf(floor.get(token) ?? '', floor.get(surface) ?? '');
      expect(
        measured,
        `${token} on ${surface} measured ${measured.toFixed(2)}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  /* WCAG 1.4.11. A hairline that separates two rows may be faint; the outline
     of a control a person has to find may not. One token cannot do both jobs,
     which is why there are two. */
  it('bounds controls at 3:1 with the strong border', () => {
    for (const surface of surfaces) {
      const measured = ratioOf(floor.get('--color-border-strong') ?? '', floor.get(surface) ?? '');
      expect(
        measured,
        `border-strong on ${surface} measured ${measured.toFixed(2)}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('the light palette', () => {
  const light = tokensOf(':root');

  /* The strong border is a gap in the light system too, so it is added to
     both scopes rather than only to the one that exposed it. */
  it('gains the strong border and keeps it at 3:1', () => {
    expect(light.get('--color-border-strong')).toBeDefined();
    for (const surface of surfaces) {
      const measured = ratioOf(light.get('--color-border-strong') ?? '', light.get(surface) ?? '');
      expect(
        measured,
        `border-strong on ${surface} measured ${measured.toFixed(2)}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('leaves the frozen values alone', () => {
    for (const token of [
      '--color-surface-base',
      '--color-text-primary',
      '--color-accent-default',
    ]) {
      expect(light.get(token)).toBeDefined();
    }
  });
});
