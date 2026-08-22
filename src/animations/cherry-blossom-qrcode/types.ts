export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface BlockData {
  positions: number[];
  mass: number[];
  baseY: number[];
  types: number[];
  gridSize: number;
  numBlocks: number;
  // Index of the first creeper voxel. Everything before it is world, so the
  // blast code can tell the bomb from what it is blowing up.
  creeperStart: number;
  // House footprint half-extents in cells, handed to the shader so the ground
  // shadow is derived from the real building instead of a duplicated formula.
  houseHalfW: number;
  houseHalfD: number;
}

export enum BlockType {
  Dirt = 0, // QR light modules - the path
  Grass = 1, // QR dark modules out on the lawn
  Cobble = 2, // foundation and chimney
  Planks = 3, // walls
  Log = 4, // corner posts and timber framing
  RoofDark = 5, // roof tile standing over a DARK module
  RoofLight = 6, // roof tile standing over a LIGHT module
  Glass = 7, // windows
  Door = 8,
  Creeper = 9, // the mob itself - rigged and animated apart from the world
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
