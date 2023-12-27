// The purpose of this function is to generate a path from a matrix of 1s and 0s.
// The path is used later to generate a QR code.
// Since we have a Path, we can easily use Skia in order to draw the QR code after that.

// Deeply Inspired by https://github.com/awesomejerry/react-native-qrcode-svg/blob/master/src/transformMatrixIntoPath.js
const transformMatrixIntoPath = (matrix: (1 | 0)[][], size: number) => {
  const cellSize = size / matrix.length;
  let path = '';
  // Loop through each row of the matrix
  matrix.forEach((row, i) => {
    let needDraw = false;
    // Loop through each column of the row
    row.forEach((column, j) => {
      if (column) {
        // If the column value is 1, a cell is present
        if (!needDraw) {
          // If needDraw is false, start a new path at the cell's position
          path += `M${cellSize * j} ${cellSize / 2 + cellSize * i} `;
          needDraw = true;
        }
        if (needDraw && j === matrix.length - 1) {
          // If needDraw is true and it's the last column, draw a line to the end of the cell
          path += `L${cellSize * (j + 1)} ${cellSize / 2 + cellSize * i} `;
        }
      } else {
        // If the column value is 0, no cell is present
        if (needDraw) {
          // If needDraw is true, draw a line to the end of the previous cell
          path += `L${cellSize * j} ${cellSize / 2 + cellSize * i} `;
          needDraw = false;
        }
      }
    });
  });

  return {
    cellSize,
    path,
  };
};

export { transformMatrixIntoPath };
