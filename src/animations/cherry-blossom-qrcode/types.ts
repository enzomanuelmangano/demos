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
  Cobble = 2, // foundation, chimney, stone accent panel
  Plaster = 3, // cream wall infill between the timbers
  Log = 4, // dark timber framing: posts, beams, rafters
  RoofDark = 5, // roof/deck board standing over a DARK module
  RoofLight = 6, // roof/deck board standing over a LIGHT module
  Glass = 7, // windows
  Door = 8,
  Planks = 9, // warm wood decking and interior floors
  Lantern = 10, // hanging lights - emissive
  Foliage = 11, // planter greenery and lawn bushes
  Creeper = 12, // the mob itself - rigged and animated apart from the world
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
