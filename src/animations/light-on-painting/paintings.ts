/**
 * The paintings you can page through.
 *
 * Each one ships an image plus a baked surface field (slope, occlusion, depth)
 * produced by scripts/bake-painting-surface.py. They are all drawn full-bleed
 * to the window's width, so only their heights differ.
 *
 * Both are scenes built around a single light source in the dark, which is the
 * point: the bulb you drag is arguing with the one the painter already put
 * there. Skies are the one thing to avoid — depth estimation puts them at the
 * back plane, where the bulb lights them like a wall.
 */
export interface Painting {
  id: string;
  title: string;
  artist: string;
  albedo: ReturnType<typeof require>;
  surface: ReturnType<typeof require>;
  meta: { width: number; height: number };
  /**
   * Whether the painted scene may hide the bulb. On a portrait it must not:
   * the sitter fills the frame, so the bulb would spend most of its travel
   * invisible behind her.
   */
  occludeBulb?: boolean;
}

export const PAINTINGS: readonly Painting[] = [
  {
    id: 'girl-with-a-pearl-earring',
    title: 'Girl with a Pearl Earring',
    artist: 'Johannes Vermeer',
    albedo: require('./assets/girl-with-a-pearl-earring.jpg'),
    surface: require('./assets/girl-with-a-pearl-earring-surface.bin'),
    meta: require('./assets/girl-with-a-pearl-earring-surface.json'),
    occludeBulb: false,
  },
  {
    id: 'nighthawks',
    title: 'Nighthawks',
    artist: 'Edward Hopper',
    albedo: require('./assets/nighthawks.jpg'),
    surface: require('./assets/nighthawks-surface.bin'),
    meta: require('./assets/nighthawks-surface.json'),
  },
];

/** Half-height in world units, where the painting's width is 1.0. */
export const halfHeightOf = (painting: Painting) =>
  0.5 / (painting.meta.width / painting.meta.height);
