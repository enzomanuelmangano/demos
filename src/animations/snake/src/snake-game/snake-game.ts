import { Directions } from 'react-native-gesture-handler';

interface Coordinate {
  x: number;
  y: number;
}

export class SnakeGame {
  private boardWidth: number;
  private boardHeight: number;
  private snake: Coordinate[];
  private food: Coordinate | null;
  private direction: Directions;
  private isGameOver: boolean;
  private score: number;
  private squareSize: number;
  private wrappingEnabled: boolean;

  constructor(
    rows: number,
    cols: number,
    squareSize: number,
    wrappingEnabled: boolean = false,
  ) {
    'worklet';
    const boardWidth = cols * squareSize;
    const boardHeight = rows * squareSize;
    this.squareSize = squareSize;
    this.boardWidth = boardWidth;
    this.boardHeight = boardHeight;
    this.snake = [
      { x: Math.floor(boardWidth / 2), y: Math.floor(boardHeight / 2) },
      {
        x: Math.floor(boardWidth / 2) - this.squareSize,
        y: Math.floor(boardHeight / 2),
      },
    ];
    this.direction = Directions.RIGHT;
    this.isGameOver = false;
    this.food = this.generateFood();
    this.score = 0;
    this.wrappingEnabled = wrappingEnabled; // Enable or disable wrapping based on this flag
  }

  // Moves the snake in the current direction
  public move(): void {
    'worklet';
    if (this.isGameOver) return;

    const head = this.snake?.[0];
    let newHead: Coordinate;

    switch (this.direction) {
      case Directions.UP:
        newHead = { x: head.x, y: head.y - this.squareSize };
        break;
      case Directions.DOWN:
        newHead = { x: head.x, y: head.y + this.squareSize };
        break;
      case Directions.LEFT:
        newHead = { x: head.x - this.squareSize, y: head.y };
        break;
      case Directions.RIGHT:
        newHead = { x: head.x + this.squareSize, y: head.y };
        break;
    }

    // If wrapping is enabled, wrap the coordinates
    if (this.wrappingEnabled) {
      newHead = this.wrapCoordinates(newHead);
    } else {
      // Otherwise, check for wall collision
      if (this.isWallCollision(newHead)) {
        this.isGameOver = true;
        return;
      }
    }

    // Check if the new head collides with itself
    if (this.isSnake(newHead)) {
      this.isGameOver = true;
      return;
    }

    // Add the new head to the snake's body
    this.snake = [newHead, ...this.snake];

    // Check if the snake eats food
    if (this.food && newHead.x === this.food.x && newHead.y === this.food.y) {
      this.score++;
      this.food = this.generateFood();
    } else {
      this.snake.pop(); // Remove the tail if the snake doesn't eat food
    }
  }

  // Wraps coordinates to the opposite side of the board if they go beyond the boundary
  private wrapCoordinates(coordinate: Coordinate): Coordinate {
    let wrappedX = coordinate.x;
    let wrappedY = coordinate.y;

    // Wrap horizontally
    if (coordinate.x < 0) {
      wrappedX = this.boardWidth - this.squareSize;
    } else if (coordinate.x >= this.boardWidth) {
      wrappedX = 0;
    }

    // Wrap vertically
    if (coordinate.y < 0) {
      wrappedY = this.boardHeight - this.squareSize;
    } else if (coordinate.y >= this.boardHeight) {
      wrappedY = 0;
    }

    return { x: wrappedX, y: wrappedY };
  }

  // Checks if the snake collides with a wall (used when wrapping is disabled)
  private isWallCollision(coordinate: Coordinate): boolean {
    return (
      coordinate.x < 0 ||
      coordinate.x >= this.boardWidth ||
      coordinate.y < 0 ||
      coordinate.y >= this.boardHeight
    );
  }

  // Changes the direction of the snake
  public changeDirection(newDirection: Directions): void {
    'worklet';
    // Prevent the snake from reversing
    if (
      (this.direction === Directions.UP && newDirection === Directions.DOWN) ||
      (this.direction === Directions.DOWN && newDirection === Directions.UP) ||
      (this.direction === Directions.LEFT &&
        newDirection === Directions.RIGHT) ||
      (this.direction === Directions.RIGHT && newDirection === Directions.LEFT)
    ) {
      return;
    }

    this.direction = newDirection;
  }

  // Generates food at a random location on the board
  private generateFood(): Coordinate | null {
    'worklet';
    let food: Coordinate;

    do {
      food = {
        x:
          Math.floor(Math.random() * (this.boardWidth / this.squareSize)) *
          this.squareSize,
        y:
          Math.floor(Math.random() * (this.boardHeight / this.squareSize)) *
          this.squareSize,
      };
    } while (this.isSnake(food)); // Ensure food does not spawn on the snake

    return food;
  }

  // Checks if a coordinate is part of the snake's body
  private isSnake(coordinate: Coordinate): boolean {
    'worklet';
    return this.snake.some(
      segment => segment.x === coordinate.x && segment.y === coordinate.y,
    );
  }

  // Gets the current state of the game
  public getState(): {
    boardWidth: number;
    boardHeight: number;
    snake: Coordinate[];
    food: Coordinate | null;
    isGameOver: boolean;
    score: number;
  } {
    'worklet';
    return {
      boardWidth: this.boardWidth,
      boardHeight: this.boardHeight,
      snake: this.snake,
      food: this.food,
      isGameOver: this.isGameOver,
      score: this.score,
    };
  }

  // Resets the game to its initial state
  public clear(): void {
    'worklet';
    this.snake = [
      {
        x: Math.floor(this.boardWidth / 2),
        y: Math.floor(this.boardHeight / 2),
      },
      {
        x: Math.floor(this.boardWidth / 2) - this.squareSize,
        y: Math.floor(this.boardHeight / 2),
      },
    ];
    this.direction = Directions.RIGHT;
    this.isGameOver = false;
    this.food = this.generateFood();
    this.score = 0;
  }
}
