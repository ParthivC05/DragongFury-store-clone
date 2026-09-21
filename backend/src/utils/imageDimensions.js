'use strict';

/**
 * Read width/height from PNG, JPEG, or WEBP buffers (no extra deps).
 * @param {Buffer} buffer
 * @returns {{ width: number, height: number } | null}
 */
function getImageDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;

  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20)
    };
  }

  // GIF
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return {
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8)
    };
  }

  // WEBP (RIFF....WEBP)
  if (
    buffer.length >= 30 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X' && buffer.length >= 30) {
      const width = 1 + buffer.readUIntLE(24, 3);
      const height = 1 + buffer.readUIntLE(27, 3);
      return { width, height };
    }
    if (chunk === 'VP8 ' && buffer.length >= 30) {
      // Lossy VP8 bitstream starts at offset 20; frame tag then 3-byte start code
      const start = 20;
      if (buffer[start + 3] === 0x9d && buffer[start + 4] === 0x01 && buffer[start + 5] === 0x2a) {
        return {
          width: buffer.readUInt16LE(start + 6) & 0x3fff,
          height: buffer.readUInt16LE(start + 8) & 0x3fff
        };
      }
    }
    if (chunk === 'VP8L' && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1
      };
    }
  }

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const length = buffer.readUInt16BE(offset + 2);
      // SOF0 / SOF2 (baseline / progressive)
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7)
        };
      }
      offset += 2 + length;
    }
  }

  return null;
}

module.exports = {
  getImageDimensions
};
