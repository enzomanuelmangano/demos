import {
  type CellValue,
  type SudokuBoard,
  isValidMove,
  isPuzzleComplete,
} from './sudoku';

export class SudokuGame {
  private board: SudokuBoard;
  private initialBoard: SudokuBoard;
  private selectedCell: { row: number; col: number } = { row: -1, col: -1 };
  private highlightedNumber: number = 0;

  constructor(initialBoard: SudokuBoard) {
    this.initialBoard = initialBoard.map(row => [...row]);
    this.board = initialBoard.map(row => [...row]);
  }

  public getBoard(): SudokuBoard {
    return this.board.map(row => [...row]);
  }

  public getInitialBoard(): SudokuBoard {
    return this.initialBoard.map(row => [...row]);
  }

  public getSelectedCell(): { row: number; col: number } {
    return { ...this.selectedCell };
  }

  public getHighlightedNumber(): number {
    return this.highlightedNumber;
  }

  public selectCell(row: number, col: number): void {
    if (this.selectedCell.row === row && this.selectedCell.col === col) {
      this.selectedCell = { row: -1, col: -1 };
      this.highlightedNumber = 0;
    } else {
      this.selectedCell = { row, col };
      this.highlightedNumber = this.board[row][col] ?? 0;
    }
  }

  public setNumber(number: number): boolean {
    const { row, col } = this.selectedCell;
    if (row === -1 || col === -1) {
      return false;
    }
    if (this.initialBoard[row][col] !== null) {
      return false;
    }

    this.highlightedNumber = number;
    this.board[row][col] = number;
    return true;
  }

  public clearCell(): boolean {
    const { row, col } = this.selectedCell;
    if (row === -1 || col === -1) {
      return false;
    }
    if (this.initialBoard[row][col] !== null) {
      return false;
    }

    this.board[row][col] = null;
    this.highlightedNumber = 0;
    return true;
  }

  public isComplete(): boolean {
    return isPuzzleComplete(this.board);
  }

  public solve(): boolean {
    const solveBoard = (currentBoard: SudokuBoard): boolean => {
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          if (currentBoard[row][col] === null) {
            for (let num = 1; num <= 9; num++) {
              if (isValidMove(currentBoard, row, col, num)) {
                currentBoard[row][col] = num;
                if (solveBoard(currentBoard)) {
                  return true;
                }
                currentBoard[row][col] = null;
              }
            }
            return false;
          }
        }
      }
      return true;
    };

    const newBoard = this.board.map(row => [...row]);
    if (solveBoard(newBoard)) {
      this.board = newBoard;
      return true;
    }
    return false;
  }

  public isCellInitial(row: number, col: number): boolean {
    return this.initialBoard[row][col] !== null;
  }

  public isCellSelected(row: number, col: number): boolean {
    return this.selectedCell.row === row && this.selectedCell.col === col;
  }

  public isCellHighlighted(value: CellValue): boolean {
    return value === this.highlightedNumber && this.highlightedNumber !== 0;
  }
}
