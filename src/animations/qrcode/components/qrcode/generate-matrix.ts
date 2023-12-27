import QRCode from 'qrcode';

export type ErrorCorrectionLevelType = 'L' | 'H' | 'Q' | 'M';

// The purpose of this function is to generate a matrix of 1s and 0s from a string.
// The matrix is used later to generate a path for the QR code.
// [1, 1, 1, 1, 1, 1, 1, 0, 1, 0,
//  1, 0, 1, 1, 0, 0, 0, 0, 1, 1,
//  1, 1, 1, 1, 1, 1, 0, 0, 0, 0,
//  0, 1, 0, 1, 0, 1, 0, 1, 1, 0,
//  1, 0, 0, 1, 0, 0, 0, 0, 0, 1,
//  1, 0, 1, 1, 1, 0, 1, 0, 1, 0,
//  0, 1, 0, 0, 1, 0, 1, 0, 1, 0 ...

// Deeply Inspired by https://github.com/awesomejerry/react-native-qrcode-svg/blob/master/src/genMatrix.js

const generateMatrix = (
  value: string,
  errorCorrectionLevel: ErrorCorrectionLevelType,
) => {
  // Convert the QR code data into an array
  const arr = Array.prototype.slice.call(
    QRCode.create(value, { errorCorrectionLevel }).modules.data,
    0,
  );

  // Calculate the square root of the array length
  const sqrt = Math.sqrt(arr.length);

  // Convert the flat array into a matrix representation
  return arr.reduce(
    (rows, key, index) =>
      (index % sqrt === 0
        ? rows.push([key])
        : rows[rows.length - 1].push(key)) && rows,
    [],
  ) as (1 | 0)[][];
};

export { generateMatrix };
