import QRCode from 'qrcode';

import {
  DEFAULT_QR_CONTENT,
  MAX_GRID_SIZE,
  MAX_QR_CONTENT_BYTES,
} from '../constants';

/**
 * Trims text to the QR byte budget. The encoder sizes the grid by UTF-8
 * bytes, while TextInput's maxLength counts UTF-16 units, so emoji or CJK
 * text under maxLength can still need a grid larger than MAX_GRID_SIZE.
 * Cuts on code points so a surrogate pair is never split.
 */
export function clampToQRBytes(text: string): string {
  let bytes = 0;
  let end = 0;
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    bytes +=
      codePoint < 0x80
        ? 1
        : codePoint < 0x800
          ? 2
          : codePoint < 0x10000
            ? 3
            : 4;
    if (bytes > MAX_QR_CONTENT_BYTES) break;
    end += char.length;
  }
  return text.slice(0, end);
}

/**
 * Generates a 2D boolean matrix from QR code content.
 * Each cell is true for dark modules, false for light modules.
 */
export function generateQRMatrix(content: string): boolean[][] {
  try {
    const qrCodeData = QRCode.create(content || DEFAULT_QR_CONTENT, {
      errorCorrectionLevel: 'M',
    });
    const { modules } = qrCodeData;
    const { size } = modules;
    // Safety net: the input is clamped to MAX_QR_CONTENT_BYTES, so this only
    // catches content that bypassed the input.
    if (size > MAX_GRID_SIZE) return generateQRMatrix(DEFAULT_QR_CONTENT);

    const matrix: boolean[][] = [];
    for (let y = 0; y < size; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < size; x++) {
        row.push(modules.get(x, y) === 1);
      }
      matrix.push(row);
    }
    return matrix;
  } catch {
    return generateQRMatrix(DEFAULT_QR_CONTENT);
  }
}
