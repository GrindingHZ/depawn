import { describe, expect, it } from 'vitest';
import { errorCodes } from './error-codes';
import { isErrorCode, messageForError, messageForErrorCode } from './error-copy';

/* P8 asks for error copy for every error code. The only way to keep that
   true is to fail when a code is added without a sentence, so this walks the
   table rather than sampling it. */
describe('error copy', () => {
  const codes = Object.keys(errorCodes);

  it.each(codes)('has a sentence for %s', (code) => {
    const message = messageForErrorCode(code);
    expect(message.length).toBeGreaterThan(0);
    // Not the fallback, unless it is the fallback.
    if (code !== 'FAULT') {
      expect(message).not.toBe(messageForErrorCode('FAULT'));
    }
  });

  it.each(codes)('says something a reader could act on for %s', (code) => {
    const message = messageForErrorCode(code);
    expect(message.endsWith('.')).toBe(true);
    expect(message[0]).toBe(message[0]?.toUpperCase());
    // No internal vocabulary leaking into copy addressed to a person.
    expect(message.toLowerCase()).not.toContain('idempotency');
    expect(message.toLowerCase()).not.toContain('null');
    expect(message.toLowerCase()).not.toContain('undefined');
  });

  it('treats anything it does not recognise as a fault', () => {
    expect(messageForErrorCode('NOT_A_REAL_CODE')).toBe(messageForErrorCode('FAULT'));
    expect(messageForErrorCode(undefined)).toBe(messageForErrorCode('FAULT'));
    expect(isErrorCode('LOAN_NOT_ACTIVE')).toBe(true);
    expect(isErrorCode('LOAN_NOT_A_THING')).toBe(false);
  });
});

describe('messageForError', () => {
  it('prefers the reason over the screen fallback when the code is one of ours', () => {
    expect(messageForError({ code: 'SYSTEM_PAUSED' }, 'The listing could not be published.')).toBe(
      messageForErrorCode('SYSTEM_PAUSED'),
    );
  });

  it('keeps the screen fallback for anything that is not one of our codes', () => {
    const fallback = 'The listing could not be published.';
    expect(messageForError(new TypeError('failed to fetch'), fallback)).toBe(fallback);
    expect(messageForError(null, fallback)).toBe(fallback);
    expect(messageForError({ code: 'SOMETHING_ELSE' }, fallback)).toBe(fallback);
  });
});
