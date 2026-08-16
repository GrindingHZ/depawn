import { describe, expect, it } from 'vitest';
import { acceptPhotograph, maximumPhotographBytes } from './photograph';

function withHeader(header: readonly number[], totalBytes = 64): Uint8Array {
  const bytes = new Uint8Array(totalBytes);
  bytes.set(header, 0);
  return bytes;
}

const jpeg = withHeader([0xff, 0xd8, 0xff, 0xe0]);
const png = withHeader([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('acceptPhotograph', () => {
  it.each([
    ['a JPEG', jpeg, 'image/jpeg'],
    ['a PNG', png, 'image/png'],
  ])('accepts %s and reports its type from the bytes', (_name, bytes, expected) => {
    const result = acceptPhotograph(bytes);
    if (!result.ok) {
      throw new Error('a real photograph must be accepted');
    }
    expect(result.value.contentType).toBe(expected);
    expect(result.value.byteLength).toBe(bytes.byteLength);
  });

  it('refuses an empty file', () => {
    const result = acceptPhotograph(new Uint8Array(0));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('empty');
    }
  });

  it('refuses a file past the size limit', () => {
    const result = acceptPhotograph(withHeader([0xff, 0xd8, 0xff], maximumPhotographBytes + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('larger than');
    }
  });

  it('accepts a file exactly at the size limit', () => {
    expect(acceptPhotograph(withHeader([0xff, 0xd8, 0xff], maximumPhotographBytes)).ok).toBe(true);
  });

  /* The three that matter. A name is not evidence of anything, and SVG is a
     document that can carry script, so serving one back from our own origin
     would be a foothold rather than a picture. */
  it('refuses a script that has been renamed to look like a photograph', () => {
    const script = new TextEncoder().encode('<script>fetch("https://evil.test")</script>');
    const result = acceptPhotograph(script);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('JPEG and PNG');
    }
  });

  it('refuses an SVG even though it is an image', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(acceptPhotograph(svg).ok).toBe(false);
  });

  it('refuses a PDF', () => {
    expect(acceptPhotograph(withHeader([0x25, 0x50, 0x44, 0x46])).ok).toBe(false);
  });

  /* A prefix of the right magic is not the right magic. */
  it('refuses bytes that only begin to look like a PNG', () => {
    expect(acceptPhotograph(new Uint8Array([0x89, 0x50, 0x4e])).ok).toBe(false);
  });

  it('reports the reason as a validation failure the api can map', () => {
    const result = acceptPhotograph(new Uint8Array(0));
    if (result.ok) {
      throw new Error('an empty file must be refused');
    }
    expect(result.error.code).toBe('VALIDATION_FAILED');
  });
});
