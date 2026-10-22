import QRCode from 'qrcode';

import { DEFAULT_QR_CONTENT, MAX_GRID_SIZE } from '../constants';

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
    // The input is capped in characters, but multi-byte text can still need
    // a grid larger than the scene is framed and its buffers are sized for.
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
