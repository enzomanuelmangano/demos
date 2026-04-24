export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface LAB {
  l: number;
  a: number;
  b: number;
}

export interface PhotoData {
  id: number;
  averageColor: RGB;
  labColor: LAB;
}

export interface GridCell {
  index: number;
  row: number;
  col: number;
  targetColor: RGB;
  photoId: number | null;
}

export interface MosaicMapping {
  gridIndex: number;
  photoId: number;
}

export type LoadingPhase =
  | 'idle'
  | 'analyzing-painting'
  | 'loading-photos'
  | 'matching'
  | 'complete';

export interface LoadingState {
  phase: LoadingPhase;
  progress: number;
  message: string;
}
