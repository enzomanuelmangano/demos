import {
  BULB_CAMERA_Z,
  BULB_REFERENCE_Z,
  BULB_SAMPLE_SPREAD,
  BULB_SOURCE_SOFTNESS,
  BULB_WORLD_RADIUS,
  CORD_ANCHOR_X,
  CORD_ITERATIONS,
  CORD_NODES,
  CORD_REST_Y,
  BULB_MASS,
  CORD_STIFFNESS,
  DRAG_FOLLOW,
  DEFAULT_SETTINGS,
  LIGHT_Z_DEFAULT,
  PAGE_SETTLE_RATE,
  PAINTING_CENTER_Y,
  PENDULUM_DAMPING,
  PENDULUM_GRAVITY,
  PHYSICS_MAX_STEPS,
  PHYSICS_STEP,
  RelightMode,
  SURFACE_FAR_Z,
  VOID_Z,
} from './constants';

import type { RelightModeValue } from './constants';

/**
 * The demo's state, split by which thread owns it.
 *
 * Physics and the render loop run on the UI thread, so `LightState` is mutated
 * there and never read from JS. Settings are the other way round — React owns
 * them and writes whole objects across, since mutating a shared value's
 * properties from JS would not propagate.
 */

/** One cord link's endpoint. Verlet keeps the previous position, not a velocity. */
export interface CordNode {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
}

export interface LightState {
  /** World units, where 1.0 is a painting's width. */
  x: number;
  y: number;
  cordLength: number;
  cord: CordNode[];
  /** False until a finger has set the cord's length. */
  paidOut: boolean;
  held: boolean;
  z: number;
  targetZ: number;
  /** Scroll position in pages; whole numbers sit on a painting. */
  pageShift: number;
  pageTarget: number;
  paging: boolean;
  /** Where the finger is asking the bulb to be, in world units. */
  targetX: number;
  targetY: number;
  /** Unsimulated time carried over between frames. */
  carry: number;
  /** Where the swipe started, and the offset the finger grabbed the bulb at. */
  pageStart: number;
  grabX: number;
  grabY: number;
  grabbed: boolean;
}

/** What React owns and pushes to the UI thread. */
export interface LightSettings {
  intensity: number;
  /** 1 shows the cord, 0 hides it. */
  cordOpacity: number;
  /** 1 shows the bulb and its glow. */
  bulbOpacity: number;
  /** With no cord there is nothing to swing from. */
  tethered: boolean;
  mode: RelightModeValue;
}

/** Per-painting facts the UI thread needs, without the asset plumbing. */
export interface PaintingFacts {
  halfHeight: number;
  occludeBulb: boolean;
  width: number;
  height: number;
}

export const createLightState = (): LightState => ({
  x: 0,
  y: 0,
  cordLength: 0,
  cord: Array.from({ length: CORD_NODES }, () => ({
    x: 0,
    y: 0,
    previousX: 0,
    previousY: 0,
  })),
  paidOut: false,
  held: false,
  z: LIGHT_Z_DEFAULT,
  targetZ: LIGHT_Z_DEFAULT,
  targetX: 0,
  targetY: 0,
  carry: 0,
  pageShift: 0,
  pageTarget: 0,
  paging: false,
  pageStart: 0,
  grabX: 0,
  grabY: 0,
  grabbed: false,
});

export const createLightSettings = (): LightSettings => ({
  intensity: DEFAULT_SETTINGS.intensity,
  cordOpacity: 1,
  bulbOpacity: 1,
  tethered: true,
  mode: RelightMode.RELIT,
});

/** Where the cord is pinned, in world units — just off the top of the screen. */
export const cordAnchorY = (aspectHeight: number) => {
  'worklet';
  return -PAINTING_CENTER_Y * aspectHeight - 0.02;
};

/** IEEE half -> float. Hermes has no Float16Array to lean on. */
export const decodeHalf = (bits: number): number => {
  'worklet';
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x03ff;
  if (exponent === 0) {
    return sign * 2 ** -24 * fraction;
  }
  if (exponent === 0x1f) {
    return fraction ? Number.NaN : sign * Infinity;
  }
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
};

/**
 * How much of the bulb's disc is clear of the scene behind it.
 *
 * The same nine-tap test the shader used to run, but it depends only on where
 * the bulb is — not on the pixel being shaded — so every pixel was recomputing
 * an identical answer. Once per frame here, nine reads instead of nine per pixel.
 *
 * Paintings that opt out of hiding the bulb opt out of dimming its glow too.
 * Otherwise the bulb stays visible over the sitter's head while its flare
 * silently vanishes, which looks like a bug because it is one.
 */
export const bulbExposure = (
  light: LightState,
  paintings: PaintingFacts[],
  fields: Uint16Array[],
): number => {
  'worklet';
  const depthAt = (worldX: number, worldY: number): number => {
    const page = Math.round(worldX + light.pageShift);
    if (page < 0 || page > paintings.length - 1) {
      return VOID_Z;
    }
    const painting = paintings[page];
    const localX = worldX - (page - light.pageShift);
    if (Math.abs(localX) > 0.5 || Math.abs(worldY) > painting.halfHeight) {
      return VOID_Z;
    }
    const u = Math.min(0.999999, Math.max(0, localX + 0.5));
    const v = Math.min(
      0.999999,
      Math.max(0, worldY / (painting.halfHeight * 2) + 0.5),
    );
    const x = Math.floor(u * painting.width);
    const y = Math.floor(v * painting.height);
    // Depth sits in the alpha channel of the rgba16float field.
    const depth = decodeHalf(fields[page][(y * painting.width + x) * 4 + 3]);
    return SURFACE_FAR_Z * (1 - depth);
  };

  const over = Math.max(
    0,
    Math.min(paintings.length - 1, Math.round(light.pageShift)),
  );
  if (!paintings[over].occludeBulb) {
    return 1;
  }

  const radius =
    BULB_WORLD_RADIUS *
    ((BULB_CAMERA_Z - BULB_REFERENCE_Z) / (BULB_CAMERA_Z - light.z));
  let open = 0;
  for (let y = -1; y <= 1; y += 1) {
    for (let x = -1; x <= 1; x += 1) {
      const clearance =
        light.z -
        depthAt(
          light.x + x * radius * BULB_SAMPLE_SPREAD,
          light.y + y * radius * BULB_SAMPLE_SPREAD,
        );
      const t = Math.min(1, Math.max(0, clearance / BULB_SOURCE_SOFTNESS));
      open += t * t * (3 - 2 * t);
    }
  }
  return open / 9;
};

/** Hang the whole cord straight down from the anchor, at rest. */
export const restCord = (light: LightState, anchorY: number) => {
  'worklet';
  light.cordLength = CORD_REST_Y - anchorY;
  const last = light.cord.length - 1;
  for (let i = 0; i <= last; i += 1) {
    const node = light.cord[i];
    node.x = CORD_ANCHOR_X;
    node.y = anchorY + light.cordLength * (i / last);
    node.previousX = node.x;
    node.previousY = node.y;
  }
  light.x = CORD_ANCHOR_X;
  light.y = anchorY + light.cordLength;
  light.targetX = light.x;
  light.targetY = light.y;
};

/**
 * Advance the cord one step: Verlet integration, then repeated distance and
 * bending constraints. Solving iteratively is what makes it behave like a rope
 * — each pass carries tension a little further along it.
 */
/** One fixed slice of cord simulation. */
const integrateCord = (
  light: LightState,
  settings: LightSettings,
  step: number,
  anchorY: number,
) => {
  'worklet';

  if (!light.paidOut) {
    // Untouched, the bulb hangs dead still. The rest length is re-derived each
    // frame so a late canvas measurement cannot leave it at the wrong height.
    restCord(light, anchorY);
    return;
  }

  if (light.held) {
    // Ease onto the finger's target rather than jumping to it, so the bulb
    // keeps moving on frames where no touch event arrived.
    const follow = 1 - Math.exp(-DRAG_FOLLOW * step);
    light.x += (light.targetX - light.x) * follow;
    light.y += (light.targetY - light.y) * follow;
  }

  if (!settings.tethered) {
    // No cord to swing from; the eased position above is the whole story.
    return;
  }

  const cord = light.cord;
  const last = cord.length - 1;
  const segment = light.cordLength / last;
  const drag = Math.exp(-PENDULUM_DAMPING * step);
  const fall = PENDULUM_GRAVITY * step * step;

  for (let i = 1; i <= last; i += 1) {
    const node = cord[i];
    if (i === last && light.held) {
      // The hand owns the bulb. Keep its history moving with it so that letting
      // go hands the rope the momentum it was already carrying.
      node.previousX = node.x;
      node.previousY = node.y;
      node.x = light.x;
      node.y = light.y;
      continue;
    }
    const velocityX = (node.x - node.previousX) * drag;
    const velocityY = (node.y - node.previousY) * drag;
    node.previousX = node.x;
    node.previousY = node.y;
    node.x += velocityX;
    node.y += velocityY + fall;
  }

  cord[0].x = CORD_ANCHOR_X;
  cord[0].y = anchorY;

  for (let pass = 0; pass < CORD_ITERATIONS; pass += 1) {
    for (let i = 0; i < last; i += 1) {
      const head = cord[i];
      const tail = cord[i + 1];
      const dx = tail.x - head.x;
      const dy = tail.y - head.y;
      const distance = Math.hypot(dx, dy) || 1e-6;
      // Solved in both directions. A one-sided constraint is more truthful —
      // a real cord folds rather than pushes — but it lets the bulb free-fall
      // whenever the cord is slack and then snap taut, and Verlet carries the
      // inward momentum through the correction, so it bounces on the
      // constraint and re-excites itself. A bulb's own weight keeps a flex
      // taut anyway, so the slack case is not worth the jitter.
      // The anchor never moves, and neither does the bulb while it is held.
      // Sharing the correction by inverse mass is what makes the bulb lead and
      // the light cord follow, rather than the whole chain undulating.
      const headWeight = i === 0 ? 0 : 1;
      const tailWeight = i + 1 === last ? (light.held ? 0 : 1 / BULB_MASS) : 1;
      const total = headWeight + tailWeight;
      if (total === 0) {
        continue;
      }
      const correction = (distance - segment) / distance / total;
      const shiftX = dx * correction;
      const shiftY = dy * correction;
      head.x += shiftX * headWeight;
      head.y += shiftY * headWeight;
      tail.x -= shiftX * tailWeight;
      tail.y -= shiftY * tailWeight;
    }

    // Bending resistance: pull each node towards the midpoint of its two
    // neighbours, which straightens the rope without shortening it.
    for (let i = 1; i < last; i += 1) {
      const previous = cord[i - 1];
      const node = cord[i];
      const next = cord[i + 1];
      node.x += ((previous.x + next.x) / 2 - node.x) * CORD_STIFFNESS;
      node.y += ((previous.y + next.y) / 2 - node.y) * CORD_STIFFNESS;
    }
  }

  light.x = cord[last].x;
  light.y = cord[last].y;
};

/**
 * Advance one rendered frame.
 *
 * Page settling is frame-rate independent already, so it takes the real delta.
 * The cord does not: it is stepped in fixed slices, with any remainder carried
 * to the next frame, so its integration never sees a varying timestep.
 */
export const advanceLight = (
  light: LightState,
  settings: LightSettings,
  deltaSeconds: number,
  anchorY: number,
) => {
  'worklet';
  const frame = Math.min(deltaSeconds, 1 / 15);

  light.z += (light.targetZ - light.z) * Math.min(1, frame * 10);

  if (!light.paging) {
    // Settle onto the page the swipe chose. Exponential rather than a spring:
    // a paging carousel should arrive, not overshoot.
    const settle = 1 - Math.exp(-PAGE_SETTLE_RATE * frame);
    const remaining = light.pageTarget - light.pageShift;
    light.pageShift =
      Math.abs(remaining) < 0.0005
        ? light.pageTarget
        : light.pageShift + remaining * settle;
  }

  light.carry += frame;
  let slices = 0;
  while (light.carry >= PHYSICS_STEP && slices < PHYSICS_MAX_STEPS) {
    integrateCord(light, settings, PHYSICS_STEP, anchorY);
    light.carry -= PHYSICS_STEP;
    slices += 1;
  }
  if (slices === PHYSICS_MAX_STEPS) {
    // Fell too far behind to catch up; drop the backlog rather than spiral.
    light.carry = 0;
  }
};
