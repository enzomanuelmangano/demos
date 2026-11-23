/**
 * White, not the shared warm paper. The cream read as coffee behind grey
 * marble; the figures are stone, and stone is shown on white.
 */
export const PAGE_BG = '#ffffff';
/** Warm near-black: the page's ink, and the button it sits beside. */
export const PAPER_INK = '#1c1a17';
/** The one accent on the page, for the rare error line. */
export const PAPER_ACCENT = '#8a2b2b';
/** Warm off-white, for anything drawn on the ink. */
export const ON_INK = '#F5F1E8';
export const INK: readonly [number, number, number] = [0.11, 0.102, 0.09];
/** The same ink for Skia: 0.11, 0.102, 0.09 in eight bits. */
export const INK_HEX = PAPER_INK;

export const GLYPH_FONT_SIZE = 46;
/**
 * Type size, as a fraction of GLYPH_FONT_SIZE.
 *
 * Fixed, and comfortable. It used to be SOLVED FOR — bisected until the whole
 * passage fit one screen — which is what dragged it down to about 8pt and made
 * the page look like a bad scan. A column that scrolls has no such constraint:
 * the text is as long as it is, and the reader moves instead of the type
 * shrinking.
 */
export const PAGE_GLYPH_SCALE = 0.34;
export const PAGE_MARGIN_FRAC = 0.09;
// Clears the launcher's close button, which sits under the status bar.
export const PAGE_TOP_FRAC = 0.14;
export const LINE_HEIGHT_FACTOR = 1.55;

// --- bust -------------------------------------------------------------------
/** Glyph size in bust units. The bust is ~2.75 units tall. */
export const GLYPH_WORLD = 0.036;
export const CAMERA_DIST = 6.4;
export const CAMERA_FOV = (32 * Math.PI) / 180;
export const CAMERA_TARGET: readonly [number, number, number] = [0, 0.05, 0];

/**
 * The figure turns on its own, slowly, all the way round, like a piece on a
 * turntable. Radians per second.
 */
export const IDLE_SPIN = 0.35;

/**
 * Lean of the ring away from the viewer.
 *
 * Face-on, a spin about the axis is almost invisible — a ring turning in its
 * own plane looks static. Leaning it means the near wall of the tube comes
 * toward the camera while the far wall retreats, and the flow of marks reads
 * as rotation instead of as a texture sliding.
 */
export const SHAPE_LEAN = 0.08;

/**
 * Where the figure faces at rest.
 *
 * A scan arrives pointing wherever the scanner stood, which is never the view
 * the sculpture is known by. The Nike is read from the front-left, wings open
 * and body striding across — square on, the wings foreshorten into the torso
 * and the silhouette stops being a silhouette.
 */
export const SHAPE_YAW_OFFSET = Math.PI * 1.35;

/**
 * Lean of each letter toward the surface normal, 0 = flat to camera.
 *
 * Fully normal-aligned looks carved but turns the letters edge-on around the
 * rim, where they stop being letters. This keeps them readable and still lets
 * the form push through them.
 */
export const GLYPH_TILT = 0.3;

/** Raking key light, in bust space. A frontal light flattens a face to an egg. */
export const LIGHT_DIR: readonly [number, number, number] = [-0.86, 0.4, 0.33];

/**
 * Ink range from the lit side to the shadow side.
 *
 * The floor is not a taste setting. Below roughly 0.2 the lit half of the bust
 * lands near the fragment shader's discard threshold, and rotating the form
 * makes individual marks cross it — they blink out one at a time and the whole
 * surface scintillates. Keep the darkest mark comfortably above the cut.
 */
export const INK_MIN = 0.46;
export const INK_MAX = 1.0;
/** Glyphs swell in shadow and thin out in the light, like a pen drawing. */
export const SIZE_LIT = 0.66;
export const SIZE_SHADOW = 1.42;

// --- morph ------------------------------------------------------------------
/**
 * The clock is a spring — one critically damped spring on one shared value,
 * and every letter a function of it. So the whole page leaves briskly and
 * settles gently, the way back is the same spring run from wherever the
 * clock is at the speed it has, and how far a letter has to go never changes
 * how long it takes. Mass, stiffness, and the damping that makes it critical:
 *
 *   c = 2 * sqrt(k * m) = 2 * sqrt(2.2 * 0.5) = 2.098
 */
export const CLOCK_MASS = 0.5;
export const CLOCK_STIFFNESS = 2.2;
export const CLOCK_DAMPING = 2.098;
/** About how long the spring takes to settle; haptics and the yaw's return use it. */
export const MORPH_DURATION_MS = 3500;

/**
 * Fraction of the timeline spent launching letters; the rest is one letter's
 * flight. So a letter is in the air for (1 - STAGGER) of the whole morph.
 *
 * This number decides whether the transition reads as one material moving or as
 * two pictures cross-fading, and the intuition points the wrong way.
 *
 * At 0.55 the launch window was longer than the flight, so at any instant
 * almost every letter was either already home or still parked — only a thin
 * band was actually travelling. Worse, letters are paired to the shape by
 * ANGLE, not by position, so the ones that leave are scattered over the whole
 * ring: the shape never eats away from one side, it just thins out evenly and
 * then is gone. Two things dissolving into each other.
 *
 * Low, the flights overlap heavily: a large fraction of the letters is in the
 * air at once and you see a stream between the page and the shape, which is the
 * thing that makes it one continuous event.
 */
export const STAGGER = 0.5;
/**
 * The path: a straight line, lifted.
 *
 * Every letter goes directly from its place on the page to its point on the
 * figure, rising toward the camera through the middle of the trip and settling
 * back as it lands — the same lift for all of them, so the swarm moves as one
 * sheet coming off the page. Per-letter randomness in the path (a bend of its
 * own, a lift of its own, a whirl about the axis) each made a crowd going
 * eleven thousand different ways, and none of it read as one event.
 */
export const FLIGHT_LIFT = 1.4;
/**
 * How far a letter tips into its direction of travel at mid-flight, radians.
 * With the lift, this is the depth: a letter that turns toward edge-on and
 * back as it crosses the screen is a thing in space, not a sprite sliding.
 */
export const FLIGHT_BANK = 0.9;
/**
 * How far past the screen's edge a letter from beyond it starts its flight,
 * in line heights. Behind the edge fades, so it emerges rather than appears.
 */
export const EDGE_LINES = 3;
/**
 * ...and enters already this far toward the figure's look. Nobody saw it as
 * text, so it need not arrive as text; at page size and full ink it came in
 * hard, a word shot across the screen.
 */
export const BEYOND_LOOK = 0.55;
/**
 * Where the page starts coming apart: the middle of the SCREEN, wherever the
 * reader has scrolled to, and outward from there. Each letter's delay is its
 * distance from that point, square-rooted so the letters in view go in the
 * first part of the window and the thousands above and below the viewport
 * stream in over the rest instead of all at once. A little jitter so the
 * front is a tide, not a drawn circle.
 */
export const RIPPLE_JITTER = 0.12;
/**
 * The imperfections. A swarm where every letter lands on the same tick, flies
 * the same straight line and sits square on the surface looks placed by a
 * machine, which it is. Three small liberties, each fixed per letter so
 * nothing shimmers: it lands somewhere in the last part of the clock rather
 * than exactly at the end; its path bows a little to one side; and on the
 * figure it sits with a slight roll, like a mark made by hand.
 */
export const LAND_SPREAD = 0.15;
/**
 * On the way home, how much of the clock one letter's flight takes. Each
 * letter's window is placed along the clock by the front, top of the page
 * first; this is its length. Short enough that the statue is still mostly a
 * statue when the first lines have set, long enough that a letter is seen
 * crossing rather than jumping.
 */
export const RETURN_WINDOW = 0.45;
export const PATH_BOW = 0.12;
export const GLYPH_ROLL = 0.25; // radians, either way
