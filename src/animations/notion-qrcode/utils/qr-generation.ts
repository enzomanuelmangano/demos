import QRCode from 'qrcode';

import { QR_DATA } from '../constants';

export const generateQRMatrix = (): boolean[][] => {
  const qrData = QRCode.create(QR_DATA, { errorCorrectionLevel: 'M' });
  const { modules } = qrData;
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
};

export const getQRBlackModules = (
  matrix: boolean[][],
): { x: number; y: number }[] => {
  const modules: { x: number; y: number }[] = [];
  const size = matrix.length;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (matrix[y][x]) {
        modules.push({ x, y });
      }
    }
  }

  return modules;
};
