import { type CellValue, type SudokuBoard, isPuzzleComplete } from './sudoku';

export class SudokuGame {
  private board: SudokuBoard;
  private initialBoard: SudokuBoard;
  private solution: SudokuBoard;
  private selectedCell: { row: number; col: number } = { row: -1, col: -1 };
  private highlightedNumber: number = 0;

  constructor(initialBoard: SudokuBoard, solution: SudokuBoard) {
    this.initialBoard = initialBoard.map(row => [...row]);
    this.solution = solution.map(row => [...row]);
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

  // The puzzle is generated with a unique solution, so solving is just
  // revealing it: brute-forcing the user's board instead could backtrack for
  // seconds when their entries made it unsolvable
  public solve(): boolean {
    this.board = this.solution.map(row => [...row]);
    return true;
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
