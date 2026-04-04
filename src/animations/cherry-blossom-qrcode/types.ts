export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface BlockData {
  positions: number[];
  heights: number[];
  baseY: number[];
  types: number[];
  gridSize: number;
  numBlocks: number;
}

// Block types for the cherry blossom tree
export enum BlockType {
  Dirt = 0, // QR light modules - tan/brown path
  CherryBlossom = 1, // QR dark in canopy - pink leaves
  Trunk = 2, // QR dark at center - brown trunk
  Grass = 3, // QR dark outside tree - green ground
  FallenPetals = 4, // Under canopy decoration
}
