export type DraggableSliderProps = {
  // Total number of lines in the slider
  linesAmount: number;
  // Maximum height of a line
  maxLineHeight: number;
  // Minimum height of a line
  minLineHeight: number;
  // Optional: Offset for determining big lines, defaults to 10
  // That means that every 10th line will be a big line
  bigLineIndexOffset?: number;
  // Optional: The width of each line, defaults to 1.5
  lineWidth?: number;
  // Optional: Callback function called when the progress changes
  onProgressChange?: (progress: number) => void;
  // Optional: Shared value representing the color of the indicator line
  indicatorColor?: string;
  // Optional: The color of the lines (default is #c6c6c6)
  lineColor?: string;
  // Optional: The color of the big lines (default is #c6c6c6)
  bigLineColor?: string;
  onCompletion?: () => void;
};
