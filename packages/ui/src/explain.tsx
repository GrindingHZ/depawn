import { useEffect, useId, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { explain, mattersFor } from './glossary';
import type { GlossaryAudience } from './glossary';

export interface ExplainProps {
  /* A key into the glossary, not the words on screen, so two places
     explaining the same thing cannot drift apart. */
  readonly termId: string;
  readonly audience?: GlossaryAudience;
}

/* An affordance next to a term the reader may not know. Opens on click
   rather than hover: hover has no touch equivalent and no keyboard
   equivalent, so a hover tooltip is a feature only some people get.

   This is never the only place a rule appears. Anything that can refuse
   somebody's money belongs in the visible copy as well; the popover is for
   depth, not for hiding consequences. */
export function Explain({ termId, audience = 'any' }: ExplainProps): ReactElement | null {
  const entry = explain(termId);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function onPointerDown(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setIsOpen(false);
        // Focus goes back where it came from, or the reader is stranded.
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  if (entry === null) {
    return null;
  }
  const matters = mattersFor(entry, audience);

  return (
    <span ref={containerRef} className="relative inline-flex items-center">
      <button
        ref={triggerRef}
        type="button"
        data-testid={`explain-${termId}`}
        aria-expanded={isOpen}
        aria-controls={popoverId}
        aria-label={`What ${entry.term.toLowerCase()} means`}
        onClick={() => setIsOpen((open) => !open)}
        className={[
          'ml-1 inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center',
          'rounded-full border font-body text-[10px] font-semibold italic leading-none',
          'transition-colors duration-150',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-status-active',
          isOpen
            ? 'border-accent bg-surface-sunken text-accent'
            : 'border-edge text-ink-secondary hover:border-accent hover:text-accent',
        ].join(' ')}
      >
        i
      </button>
      {isOpen ? (
        <span
          id={popoverId}
          role="dialog"
          aria-label={entry.term}
          data-testid={`explanation-${termId}`}
          className={[
            /* Anchored to the right edge, because the terms that carry one of
               these are usually the last thing in a row and a left anchored
               panel would run off the screen. */
            'absolute right-0 top-full z-40 mt-2 w-72 rounded-lg border border-edge',
            'bg-surface-raised p-4 text-left shadow-lg',
            'max-w-[calc(100vw-2rem)]',
          ].join(' ')}
        >
          <span className="block font-body text-sm font-semibold text-ink-primary">
            {entry.term}
          </span>
          <span className="mt-1 block font-body text-sm leading-relaxed text-ink-secondary">
            {entry.definition}
          </span>
          {matters === null ? null : (
            <span className="mt-3 block border-t border-edge pt-3 font-body text-sm leading-relaxed text-ink-primary">
              <span className="font-semibold text-accent">Why it matters to you: </span>
              {matters}
            </span>
          )}
        </span>
      ) : null}
    </span>
  );
}
