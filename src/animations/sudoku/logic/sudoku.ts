// Define types for our Sudoku game
export type CellValue = number | null;
export type SudokuBoard = CellValue[][];

// Sudoku validation functions
export const isValidMove = (
  board: SudokuBoard,
  row: number,
  col: number,
  num: number,
): boolean => {
  // Check row
  for (let x = 0; x < 9; x++) {
    if (board[row][x] === num && x !== col) return false;
  }

  // Check column
  for (let x = 0; x < 9; x++) {
    if (board[x][col] === num && x !== row) return false;
  }

  // Check 3x3 box
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (
        board[boxRow + i][boxCol + j] === num &&
        boxRow + i !== row &&
        boxCol + j !== col
      ) {
        return false;
      }
    }
  }

  return true;
};

const fillBox = (board: SudokuBoard, row: number, col: number): void => {
  const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  let index = 0;

  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      board[row + i][col + j] = nums[index++];
    }
  }
};

const shuffle = <T>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

const findEmpty = (board: SudokuBoard): [number, number] | null => {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col] === null) {
        return [row, col];
      }
    }
  }
  return null;
};

const solveSudoku = (board: SudokuBoard): boolean => {
  const empty = findEmpty(board);
  if (!empty) return true;

  const [row, col] = empty;
  const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);

  for (const num of nums) {
    if (isValidMove(board, row, col, num)) {
      board[row][col] = num;
      if (solveSudoku(board)) return true;
      board[row][col] = null;
    }
  }

  return false;
};

const countSolutions = (
  board: SudokuBoard,
  count: { value: number },
): boolean => {
  const empty = findEmpty(board);
  if (!empty) {
    count.value++;
    return count.value > 1;
  }

  const [row, col] = empty;
  for (let num = 1; num <= 9; num++) {
    if (isValidMove(board, row, col, num)) {
      board[row][col] = num;
      if (countSolutions(board, count) && count.value > 1) return true;
      board[row][col] = null;
    }
  }

  return false;
};

// Sudoku generator and solver
export const generateSudoku = (
  difficulty: 'easy' | 'medium' | 'hard' = 'medium',
): { puzzle: SudokuBoard; solution: SudokuBoard } => {
  // Initialize empty board
  const board: SudokuBoard = Array(9)
    .fill(null)
    .map(() => Array(9).fill(null));

  // Fill diagonal boxes first (they are independent)
  for (let box = 0; box < 9; box += 3) {
    fillBox(board, box, box);
  }

  // Fill the rest
  solveSudoku(board);

  // Create a copy of the solved board
  const solution: SudokuBoard = board.map(boardRow => [...boardRow]);

  // Remove numbers to create the puzzle
  const puzzle: SudokuBoard = board.map(boardRow => [...boardRow]);
  const cellsToRemove = {
    easy: 35,
    medium: 45,
    hard: 55,
  }[difficulty];

  let removed = 0;

  while (removed < cellsToRemove) {
    const randomRow = Math.floor(Math.random() * 9);
    const randomCol = Math.floor(Math.random() * 9);

    if (puzzle[randomRow][randomCol] !== null) {
      const temp = puzzle[randomRow][randomCol];
      puzzle[randomRow][randomCol] = null;

      // Check if puzzle still has a unique solution
      const tempBoard = puzzle.map(boardRow => [...boardRow]);
      const solutions = { value: 0 };
      countSolutions(tempBoard, solutions);

      if (solutions.value === 1) {
        removed++;
      } else {
        puzzle[randomRow][randomCol] = temp;
      }
    }
  }

  return { puzzle, solution };
};

// Helper function to check if a cell's value is valid
export const isCellValid = (
  board: SudokuBoard,
  rowIndex: number,
  colIndex: number,
): boolean => {
  const value = board[rowIndex][colIndex];
  if (value === null) return true;

  // Temporarily clear the cell to check if the current value is valid
  const tempBoard = board.map(boardRow => [...boardRow]);
  tempBoard[rowIndex][colIndex] = null;
  return isValidMove(tempBoard, rowIndex, colIndex, value);
};

// Helper function to check if the puzzle is complete
export const isPuzzleComplete = (board: SudokuBoard): boolean => {
  // Check if all cells are filled
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col] === null || !isCellValid(board, row, col)) {
        return false;
      }
    }
  }
  return true;
};
