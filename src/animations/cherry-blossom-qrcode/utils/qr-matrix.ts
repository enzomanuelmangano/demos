import QRCode from 'qrcode';

import { DEFAULT_QR_CONTENT } from '../constants';

/**
 * Generates a 2D boolean matrix from QR code content.
 * Each cell is true for dark modules, false for light modules.
 *
 * Level M, and deliberately NOT a higher one. The obvious move for a code
 * meant to be scanned off a screen recording is to raise error correction,
 * but measuring it says otherwise: for a TestFlight URL, Q pushes the symbol
 * from 29x29 to 33x33, and every module gets ~13% smaller. Decoding the
 * rendered flat view after a downscale and JPEG at quality 45:
 *
 *   scale     1.0    0.6    0.45   0.3
 *   ECC M     ok     ok     ok     ok
 *   ECC Q     fail   fail   ok     ok
 *
 * Module size is the binding constraint on video, not the recovery budget,
 * and a denser grid costs more than the extra recovery buys back.
 */
export function generateQRMatrix(content: string): boolean[][] {
  try {
    const qrCodeData = QRCode.create(content || DEFAULT_QR_CONTENT, {
      errorCorrectionLevel: 'M',
    });
    const { modules } = qrCodeData;
    const { size } = modules;

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
