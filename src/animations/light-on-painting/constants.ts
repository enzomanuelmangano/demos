/**
 * Tunables for the relighting pass.
 *
 * World units: 1.0 == the width of the painting. The canvas sits on the z = 0
 * plane and the painted scene recedes behind it down to SURFACE_FAR_Z. There is
 * no wall and no frame — the painting floats on black.
 */

/**
 * Depth of the furthest surface the relit painting can hold. Kept shallow on
 * purpose: with a deep scene the near pavement sits so much closer to the bulb
 * than the diner interior that only the pavement ever visibly reacts.
 */
export const SURFACE_FAR_Z = -0.32;

/**
 * Light travel limits along z. The bulb hangs *inside* the painted scene rather
 * than in front of it, so the counter and the figures can pass in front of it
 * as it moves. It stops just short of the back wall so it is never fully
 * swallowed.
 */
export const LIGHT_Z_MIN = SURFACE_FAR_Z + 0.04;
export const LIGHT_Z_MAX = 0.5;
/**
 * Rest depth, a little past the middle of the scene. This is what decides how
 * much of the painting stands in front of the bulb: hang it near z = 0 and the
 * whole scene is behind it, so the cord draws straight over the pavement and
 * the counter as if they weren't there.
 */
export const LIGHT_Z_DEFAULT = -0.18;

/** The painting spans the full window width, edge to edge. */
export const PAINTING_WIDTH_RATIO = 1;

export const DEFAULT_SETTINGS = {
  /**
   * Brightness of the point light. Fixed rather than exposed: it was a slider,
   * but the interesting range is narrow and every value outside it either
   * washes the painting out or hides it.
   */
  intensity: 4.05,
  /** Ambient fill, i.e. how much of the painting survives with the bulb far away. */
  exposure: 0.085,
  /** Multiplier on the baked depth slope — how much relief the light finds. */
  relief: 1.25,
  /** Varnish sheen. */
  specular: 0.3,
  /** Strength of the raymarched shadows. */
  shadow: 0.85,
  /** Strength of the baked height-field occlusion. */
  occlusion: 0.6,
  /**
   * Distance at which the light has fallen to half strength, in painting
   * widths. This is what makes it read as a lamp rather than a brightness
   * slider: at 0.7 the far corner of the canvas still sits at half strength, so
   * the whole picture stays lit. It has to be a small fraction of the painting
   * for the light to fall off inside the frame.
   */
  lightReach: 0.42,
  /**
   * The scene's depth is scaled by this before the shadow march. Shadows need
   * the caster to stand clear of what it falls on, but too much and everything
   * behind the front plane sits in permanent darkness.
   */
  shadowLift: 1.15,
  /** Tungsten. */
  lightColor: [1, 0.76, 0.5] as const,
};

/**
 * Bulb geometry, shared with the shader. The exposure test runs on the CPU now,
 * so these values have to mean the same thing on both sides — keep them in step
 * with the matching constants in shaders/relight.ts.
 */
export const VOID_Z = -32;
export const BULB_WORLD_RADIUS = 0.045;
export const BULB_CAMERA_Z = 2;
export const BULB_REFERENCE_Z = 0.42;
export const BULB_SOURCE_SOFTNESS = 0.08;
export const BULB_SAMPLE_SPREAD = 0.6;

/** Tungsten, as a hex string, for the native controls to borrow. */
export const LAMP_TINT = '#FFC280';

/** Debug views, mirrored in the shader. */
export const RelightMode = {
  RELIT: 0,
  ALBEDO: 1,
  DEPTH: 2,
  NORMALS: 3,
} as const;

export type RelightModeValue = (typeof RelightMode)[keyof typeof RelightMode];

/**
 * How close a finger has to land to take hold of the bulb, in points. The bulb
 * itself is only ~18pt across, so the grab area is padded out to something a
 * fingertip can actually find.
 */
export const LIGHT_GRAB_RADIUS = 64;

/**
 * The cord is simulated as a small rope rather than one rigid link. A single
 * link swings correctly but draws as a stiff straight line; a chain of links is
 * still a pendulum — a compound one — and it bends, lags and settles the way a
 * flex actually does.
 */
/**
 * Twelve nodes, packed two per vec4 into the shader's cordNodes uniform.
 *
 * Node count is what buys a smooth, thread-like curve. Too few and the rope
 * reads as a polyline with visible corners, which is what made an earlier,
 * floppier version look wrong — the fault was the kinks, not the flexibility.
 */
export const CORD_NODES = 12;

/**
 * How fast the bulb converges on the finger, in e-folds per second.
 *
 * Touch events arrive far less often than frames — a drag can produce five
 * updates while the screen draws sixty — so pinning the bulb straight to the
 * finger makes it teleport between events. Chasing a target instead keeps it
 * moving on every frame, and costs a few milliseconds of lag nobody can see.
 */
export const DRAG_FOLLOW = 30;

/**
 * The cord is integrated in fixed slices, not in whole frames.
 *
 * Position-Verlet infers velocity from the gap between the last two positions,
 * which encodes the *previous* step's duration. Hand it a different duration
 * and the implied velocity is wrong, so energy appears from nowhere. Frame
 * timing goes irregular exactly when the UI thread is busy handling touches —
 * which is why the bulb bounced while dragging and paging, and why raising
 * gravity made it worse. A constant slice removes the whole failure mode.
 */
export const PHYSICS_STEP = 1 / 120;

/** Ceiling on catch-up slices per frame, so a stall cannot spiral. */
export const PHYSICS_MAX_STEPS = 6;

/** Verlet constraint passes per frame. More is stiffer and steadier. */
export const CORD_ITERATIONS = 10;

/**
 * How strongly the cord resists bending, 0 loose and 1 rigid. Just enough to
 * take the kinks out between nodes — push it far and the cord stops being a
 * flex and becomes a stick.
 */
export const CORD_STIFFNESS = 0.22;

/**
 * The bulb hangs from a fixed point above the painting on an inextensible cord,
 * and swings as a real pendulum: let go of it off to one side and it arcs back
 * through the bottom, overshoots, and settles hanging straight down.
 *
 * Physics runs in world units, where 1.0 is the painting's width. Gravity is
 * solved back from the swing period a pendulum that size actually has: a
 * one-unit cord lands near 1.3s. Too low and the whole thing drifts in slow
 * motion, which reads as floaty and fake however well the cord bends.
 */
export const PENDULUM_GRAVITY = 24;

/** Light damping: several visible swings before it comes to rest. */
export const PENDULUM_DAMPING = 0.5;

/**
 * How much heavier the bulb is than a cord node.
 *
 * With equal masses the rope behaves like a uniform chain and undulates along
 * its whole length. A bulb on a flex is a heavy weight on a light wire: the
 * bulb should lead and the cord should follow it.
 */
export const BULB_MASS = 8;

/** Where the cord is pinned, in world units relative to the painting's centre. */
export const CORD_ANCHOR_X = 0;

/**
 * Dragging pays cord out and reels it back in between these lengths. The
 * maximum has to clear the far bottom corner of the screen — anything shorter
 * and the bulb hits the end of its arc partway across the painting and simply
 * stops following your finger.
 */
export const CORD_MIN_LENGTH = 0.12;
// Long cords swing very slowly (the period goes with the square root of the
// length), so this is capped short of the screen's diagonal to keep the swing
// lively while still reaching the whole painting.
export const CORD_MAX_LENGTH = 1.7;

/** Vertical placement of the painting's centre, in screen uv. */
export const PAINTING_CENTER_Y = 0.5;

/**
 * Where the bulb comes to rest, in world units above the painting's centre.
 *
 * Fixed, not per-painting. The lamp is an object in the room and the paintings
 * slide behind it, so tying its height to the current artwork made it climb
 * across every swipe — which reads as the bulb jumping when you page. A
 * portrait can no longer swallow it either, since those opt out of occluding
 * the bulb.
 */
export const CORD_REST_Y = -0.25;

/** What counts as a tap rather than a swipe, and how close two must fall to
 *  read as a double tap. */
export const TAP_SLOP = 12;
export const TAP_DURATION = 300;
export const TAP_GAP = 320;

/** How fast a released swipe settles onto its page, in e-folds per second. */
export const PAGE_SETTLE_RATE = 12;

/** Fraction of the screen, or flick speed, that commits to the next painting. */
export const PAGE_COMMIT_FRACTION = 0.25;
export const PAGE_FLICK_VELOCITY = 450;

/** Uniform buffer layout: see Params in shaders/relight.ts. */
export const UNIFORM_BUFFER_SIZE = 256;
