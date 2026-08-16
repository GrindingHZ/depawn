import { crc32 } from 'node:zlib';
import { deflateSync } from 'node:zlib';

function chunk(type: string, body: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.byteLength);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typed) >>> 0);
  return Buffer.concat([length, typed, checksum]);
}

/* A real PNG, written by hand because the alternative is a native image
   dependency whose only job here is to make the demo inventory look like
   something. Used by the seed and by tests that need bytes the photograph
   check will actually accept. */
export function solidPng(
  width: number,
  height: number,
  rgb: readonly [number, number, number],
): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(2, 9); // colour type: truecolour
  header.writeUInt8(0, 10); // deflate
  header.writeUInt8(0, 11); // adaptive filtering
  header.writeUInt8(0, 12); // no interlace

  // Each scanline is a filter byte followed by three bytes per pixel.
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row += 1) {
    const start = row * stride;
    raw[start] = 0;
    for (let column = 0; column < width; column += 1) {
      const pixel = start + 1 + column * 3;
      raw[pixel] = rgb[0];
      raw[pixel + 1] = rgb[1];
      raw[pixel + 2] = rgb[2];
    }
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
