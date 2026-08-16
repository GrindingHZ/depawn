import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Explain } from './explain';
import { glossary } from './glossary';

describe('Explain', () => {
  it('says nothing until it is asked', () => {
    render(<Explain termId="loanToValue" />);
    expect(screen.queryByTestId('explanation-loanToValue')).toBeNull();
    expect(screen.getByTestId('explain-loanToValue').getAttribute('aria-expanded')).toBe('false');
  });

  it('opens on click and closes on a second click', () => {
    render(<Explain termId="loanToValue" />);

    fireEvent.click(screen.getByTestId('explain-loanToValue'));
    expect(screen.getByTestId('explanation-loanToValue')).toBeTruthy();

    fireEvent.click(screen.getByTestId('explain-loanToValue'));
    expect(screen.queryByTestId('explanation-loanToValue')).toBeNull();
  });

  /* The same term reads differently depending on which side of the loan the
     reader is on, and getting that wrong is worse than saying nothing. */
  it('tells a lender and a borrower different things about grace', () => {
    const { unmount } = render(<Explain termId="gracePeriod" audience="lender" />);
    fireEvent.click(screen.getByTestId('explain-gracePeriod'));
    expect(screen.getByTestId('explanation-gracePeriod').textContent).toContain(
      'cannot begin a claim',
    );
    unmount();

    render(<Explain termId="gracePeriod" audience="borrower" />);
    fireEvent.click(screen.getByTestId('explain-gracePeriod'));
    expect(screen.getByTestId('explanation-gracePeriod').textContent).toContain(
      'does not cost you the item',
    );
  });

  it('closes on Escape and puts focus back on the trigger', () => {
    render(<Explain termId="maturity" />);
    const trigger = screen.getByTestId('explain-maturity');

    fireEvent.click(trigger);
    expect(screen.getByTestId('explanation-maturity')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('explanation-maturity')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  /* Clicking anywhere else dismisses it, so a reader is never stuck with a
     panel they cannot see past. */
  it('closes when the reader clicks away', () => {
    render(<Explain termId="maturity" />);
    fireEvent.click(screen.getByTestId('explain-maturity'));
    expect(screen.getByTestId('explanation-maturity')).toBeTruthy();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('explanation-maturity')).toBeNull();
  });

  it('is a real button, so the keyboard reaches it', () => {
    render(<Explain termId="maturity" />);
    const trigger = screen.getByTestId('explain-maturity');
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('type')).toBe('button');
  });

  it('renders nothing at all for a term nobody has written yet', () => {
    const { container } = render(<Explain termId="notATermWeHave" />);
    expect(container.innerHTML).toBe('');
  });

  it('names the term for a screen reader rather than announcing a letter', () => {
    render(<Explain termId="appraisedValue" />);
    expect(screen.getByRole('button', { name: 'What appraised value means' })).toBeTruthy();
  });
});

describe('the glossary itself', () => {
  /* The second paragraph is the one that teaches. An entry without one is a
     dictionary definition, which is what this component exists to avoid. */
  it.each(Object.keys(glossary))('%s explains what it means for somebody', (termId) => {
    const entry = glossary[termId];
    expect(entry?.definition.length ?? 0).toBeGreaterThan(20);
    expect(Object.keys(entry?.matters ?? {}).length).toBeGreaterThan(0);
  });

  it.each(Object.keys(glossary))('%s is written in plain words', (termId) => {
    const entry = glossary[termId];
    const text = `${entry?.term ?? ''} ${entry?.definition ?? ''}`.toLowerCase();
    for (const jargon of ['dto', 'endpoint', 'enum', 'null', 'basis point']) {
      expect(text).not.toContain(jargon);
    }
  });
});
