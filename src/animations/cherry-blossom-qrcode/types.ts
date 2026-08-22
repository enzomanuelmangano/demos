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
  // Phone footprint and screen bounds, handed to the shader so the ground
  // shadow and the display artwork are derived from the real geometry rather
  // than from a formula duplicated in WGSL.
  phoneHalfW: number;
  phoneHalfD: number;
  screenLo: number;
  screenHi: number;
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
  PhoneBody = 12, // the handset's frame and bezel
  Screen = 13, // its display - emissive
  Creeper = 14, // the mob itself - rigged and animated apart from the world
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
