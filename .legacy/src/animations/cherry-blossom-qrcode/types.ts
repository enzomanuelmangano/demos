export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface BlockData {
  positions: number[];
  /** Vanilla blast resistance per block; drives how deep the crater cuts. */
  resistance: number[];
  baseY: number[];
  types: number[];
  gridSize: number;
  numBlocks: number;
  // Index of the first creeper voxel. Everything before it is tree, so the
  // blast code can tell the bomb from what it is blowing up.
  creeperStart: number;
}

// Block types for the cherry blossom tree
export enum BlockType {
  Dirt = 0, // QR light modules - tan/brown path
  CherryBlossom = 1, // QR dark in canopy - pink leaves
  Trunk = 2, // QR dark at center - brown trunk
  Grass = 3, // QR dark outside tree - green ground
  FallenPetals = 4, // Under canopy decoration
  Creeper = 5, // The mob itself — rigged and animated apart from the tree
}

// Which limb a creeper voxel belongs to. Drives the walk rig in the vertex
// shader (pivot + swing) and the face mask in the fragment shader.
export enum CreeperPart {
  Head = 0,
  Body = 1,
  LegFrontLeft = 2,
  LegFrontRight = 3,
  LegBackLeft = 4,
  LegBackRight = 5,
}
