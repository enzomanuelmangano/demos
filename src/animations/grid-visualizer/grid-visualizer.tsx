import { useMemo, type FC } from 'react';

import {
  makeMutable,
  useAnimatedReaction,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import {
  Atlas,
  Canvas,
  Fill,
  Skia,
  useRectBuffer,
  useTexture,
  type SkFont,
} from 'react-native-skia';

type GridVisualizerProps = {
  text: SharedValue<string | null>; // The text to display (e.g. '99')
  font: SkFont | null; // The font to use for the text
  width: number; // the Canvas width
  height: number; // the Canvas height
  hSquaresAmount: number; // the amount of horizontal squares
  vSquaresAmount: number; // the amount of vertical squares
  squareSize: number; // the size of each small square

  // This was hard to name, and I think it's not the best name at all.
  // To visualize it, I recommend you to set it to 0 and to increase it
  // manually to see what happens
  scaleFactor: number;
};

// The whole idea of this component is to display a grid of squares.
// A text is going to be passed to the grid, but it won't be displayed as a regular text.
// The text will be converted to a path, and all the squares that are contained in the path
// will be highlighted with a different color and remapped to a different position (depending on the scaleFactor).

// To achieve this, we need to:
// - Create a path from the text
// - Create a grid of squares
// - Check if each square is contained in the path (activeRects)
// - Animate the squares that are contained in the path (activeProgress)
// - Animate the colors of the squares that are contained in the path (colors)
// - Animate the position of the squares that are contained in the path (transforms)

// Since the component can support a ton of squares, we can't use
// neither regular Animated.Views nor regular Skia Rects.
// We need to use the Atlas API from Skia which supports rendering a lot of sprites with the same texture.

// From the [Skia docs](https://shopify.github.io/react-native-skia/docs/shapes/atlas/)
// The Atlas component is used for efficient rendering of multiple instances of the same texture or image.
// It is especially useful for drawing a very large number of similar objects, like sprites, with varying transformations.

// The Atlas API is a bit low-level, but it's super powerful.
// Keep in mind that (in my opinion) without Atlas, you just can't make this animation with a decent performance :)
export const GridVisualizer: FC<GridVisualizerProps> = ({
  text,
  font,
  width: canvasWidth,
  height: canvasHeight,
  hSquaresAmount: HSquares,
  vSquaresAmount: VSquares,
  scaleFactor,
  squareSize: squareSize,
}) => {
  const XSpacing = (canvasWidth - scaleFactor) / HSquares;
  const YSpacing = (canvasHeight - scaleFactor) / VSquares;
  const SquaresAmount = HSquares * VSquares;
  const ScaledXSpacing = canvasWidth / HSquares;
  const ScaledYSpacing = canvasHeight / VSquares;

  // Convert the Text into a Skia Path
  // We'll need to do that because we wan't to check if each square is contained in a Text
  // But we can't do that with a regular text, we need to convert it to a Path (which provides the "contains" method)
  const animatedText = useDerivedValue(() => {
    const textValue = text.get();
    if (!textValue || !font) {
      return null;
    }
    const textDim = font?.measureText(textValue) ?? {
      width: 0,
      height: 0,
    };
    const x = canvasWidth / 2 - textDim.width / 2;
    const y = canvasHeight / 2 + textDim.height / 2;

    const t = Skia.Path.MakeFromText(textValue, x, y, font);

    return t;
  }, [font]);

  // We need to check if each square is contained in the Text Path
  // To do that, we'll use the "contains" method from the Path
  // We'll use a derived value to do that because we need to check it every frame
  const activeRects = useDerivedValue(() => {
    const path = animatedText.get();
    // contains() walks the whole glyph outline; most squares sit outside the
    // text's bounds, where it can only answer false, so skip the native call.
    const bounds = path ? path.getBounds() : null;
    return new Array(SquaresAmount).fill(false).map((_, i) => {
      if (!path || !bounds) {
        return false;
      }
      const tx = (i % HSquares) * XSpacing + (XSpacing + scaleFactor) / 2;
      const ty =
        Math.floor(i / HSquares) * YSpacing + (YSpacing + scaleFactor) / 2;
      const px = tx + squareSize / 2;
      const py = ty + squareSize / 2;
      if (
        px < bounds.x ||
        py < bounds.y ||
        px > bounds.x + bounds.width ||
        py > bounds.y + bounds.height
      ) {
        return false;
      }
      return path.contains(px, py);
    });
  }, []);

  // This randomDelays is very hard to explain, but it's the key to make the animation look good.
  // My first intention was to do something like that. But this won't work because the delay is going to be the same for all the squares.
  // Instead, we need to generate a random delay for each square to make the animation look more organic.
  // I was really panicking because I didn't have any idea of how to achieve that.
  // const activeProgress = useDerivedValue(() => {
  //   return withDelay(
  //     Math.random(),
  //     withSpring(
  //       activeRects.value.map((isActive, i) => {
  //         return isActive ? 1 : 0;
  //       }),
  //       { mass: 2 },
  //     ),
  //   );
  // }, []);

  // Every square runs two springs (delay + progress), so 3500 Reanimated
  // animations ran per frame. Instead, all of them live in typed arrays and
  // a single UI-thread loop steps them with the exact math of withSpring
  // (see the spring helpers at the bottom of the file).
  // The per-square random delays are still the key to the organic look:
  // the delay spring is never drawn, it is only sampled at the next text change.
  const springs = useMemo(() => {
    const initialDelays = new Float64Array(SquaresAmount);
    for (let i = 0; i < SquaresAmount; i++) {
      initialDelays[i] = Math.random() - 0.5;
    }
    return makeMutable({
      delay: createSpringSet(SquaresAmount, initialDelays),
      progress: createSpringSet(SquaresAmount, new Float64Array(SquaresAmount)),
      looping: false,
    });
  }, [SquaresAmount]);

  // Bumped after every step so the RSXform mapper redraws
  const frame = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useAnimatedReaction(
    () => activeRects.get(),
    newActiveRects => {
      const state = springs.get();
      const now = getAnimationTimestamp();

      // The delay springs are never drawn, only sampled here, so they are not
      // stepped every frame: bring them to `now` in one closed-form step (the
      // spring solution is exact for any time step).
      advanceSprings(state.delay, now, DelaySpringConfig);

      // First update delay values
      for (let i = 0; i < SquaresAmount; i++) {
        const isActive = newActiveRects[i];
        setSpring(
          state.delay,
          i,
          isActive ? 1 : Math.random() - 0.5,
          now,
          DelaySpringConfig,
          reduceMotion,
          // ~1750 bisections in this one frame were the cost of a text
          // change; they're spread over the next frames instead
          true,
        );
      }

      // Then update progress values based on delay values
      for (let i = 0; i < SquaresAmount; i++) {
        const isActive = newActiveRects[i];
        setSpring(
          state.progress,
          i,
          isActive ? state.delay.current[i] : 0,
          now,
          ProgressSpringConfig,
          reduceMotion,
        );
      }

      frame.set(frame.get() + 1);

      if (state.looping) {
        return;
      }
      state.looping = true;
      const loop = (timestamp: number) => {
        // Only the drawn springs are stepped per frame (see advanceSprings);
        // the delay springs only get their deferred stiffness solved, a
        // slice per frame, well before the next text change samples them.
        const pending = resolvePendingSprings(
          state.delay,
          DelaySpringConfig,
          PENDING_SPRINGS_PER_FRAME,
        );
        const running =
          stepSprings(state.progress, timestamp, ProgressSpringConfig) |
          (pending > 0 ? 1 : 0);
        frame.set(frame.get() + 1);
        if (running) {
          requestAnimationFrame(loop);
        } else {
          // Everything is at rest: stop requesting frames
          state.looping = false;
        }
      };
      requestAnimationFrame(loop);
    },
  );

  // The squares used to get a per-sprite color of [1, 1, 1, 0.8], but the
  // Atlas blends colors with DstOver (the default) onto an opaque white
  // texture, so they never changed a pixel; they only cost 1750 color
  // conversions on every frame. They are dropped.
  // (The original idea was to fade the squares in and out organically with
  // interpolate(progress, [-3, 0, 1, 2], [0, 0.8, 0, 0]) on the alpha.)

  // We need to provide a texture to the Atlas (We're just saying that the texture is a white by default)
  const texture = useTexture(<Fill color={'white'} />, {
    width: canvasWidth,
    height: canvasHeight,
  });

  // The RSXforms animate the position and scale of the squares.
  // The idea is that by default, the squares are going to be positioned in a shrinked grid (because of the scaleFactor).
  // When the square gets active, the squares are going to be positioned in a scaled grid
  // If the scaleFactor is 0, the shrinked grid is going to be the same as the scaled grid.
  // The magic happens because of the individual progress shared values and the interpolate function.

  // Last progress written to each RSXform: squares at rest (most of them,
  // most of the time) skip the native set() call.
  const lastProgress = useMemo(() => {
    return new Float64Array(SquaresAmount).fill(NaN);
  }, [SquaresAmount]);

  // One loop per frame over RSXforms updated in place (a per-sprite modifier
  // callback allocated a closure environment per square per frame); the
  // shared value only tells the Atlas to redraw.
  const transforms = useMemo(() => {
    return makeMutable(
      Array.from({ length: SquaresAmount }, () => Skia.RSXform(1, 0, 0, 0)),
    );
  }, [SquaresAmount]);

  useAnimatedReaction(
    // Subscribes to the spring loop
    () => frame.get(),
    () => {
      const xforms = transforms.get();
      const progress = springs.get().progress.current;

      const xShrinkedOffset = (XSpacing + scaleFactor) / 2;
      const yShrinkedOffset = (YSpacing + scaleFactor) / 2;

      const xScaledOffset = ScaledXSpacing / 2;
      const yScaledOffset = ScaledYSpacing / 2;

      let changed = false;
      for (let i = 0; i < SquaresAmount; i++) {
        const prog = progress[i];
        if (prog === lastProgress[i]) {
          continue;
        }
        lastProgress[i] = prog;
        changed = true;

        const shrinkedTx = (i % HSquares) * XSpacing + xShrinkedOffset;
        const shrinkedTy =
          Math.floor(i / HSquares) * YSpacing + yShrinkedOffset;

        const scaledTx = (i % HSquares) * ScaledXSpacing + xScaledOffset;
        const scaledTy =
          Math.floor(i / HSquares) * ScaledYSpacing + yScaledOffset;

        // Inlined interpolate(prog, [0, 1], ...): same math, without
        // allocating the range arrays 5250 times per frame
        const tx = shrinkedTx + prog * (scaledTx - shrinkedTx);
        const ty = shrinkedTy + prog * (scaledTy - shrinkedTy);

        // interpolate(prog, [0, 1], [0.6, 0.85], Extrapolation.CLAMP)
        const scale = Math.min(Math.max(0.6 + prog * (0.85 - 0.6), 0.6), 0.85);

        xforms[i].set(scale, 0, tx, ty);
      }
      if (changed) {
        // Same array, so force the notification
        transforms.modify(undefined, true);
      }
    },
  );

  // We need to provide the position of each square to the Atlas
  const sprites = useRectBuffer(SquaresAmount, (val, j) => {
    'worklet';
    const x = (j % HSquares) * XSpacing;
    const y = Math.floor(j / HSquares) * YSpacing;
    val.setXYWH(x, y, squareSize, squareSize);
  });

  return (
    <Canvas
      style={{
        width: canvasWidth,
        height: canvasHeight,
      }}>
      <Atlas image={texture} sprites={sprites} transforms={transforms} />
    </Canvas>
  );
};

// Spring helpers.
// A line-by-line port of Reanimated's withSpring (onStart + onFrame in
// react-native-reanimated/src/animation/spring) for numbers, so the motion
// is identical to the previous per-square withSpring animations.

type SpringConfig = {
  mass: number;
  energyThreshold: number;
  // physics-based config
  stiffness: number;
  damping: number;
  // duration-based config (useDuration)
  useDuration: boolean;
  duration: number;
  dampingRatio: number;
};

// withSpring(target, { duration: 2000 }), merged with Reanimated's defaults
const DelaySpringConfig: SpringConfig = {
  mass: 4,
  energyThreshold: 6e-9,
  stiffness: 900,
  damping: 120,
  useDuration: true,
  duration: 2000,
  dampingRatio: 1,
};

// withSpring(target, { mass: 2, damping: 10, stiffness: 100 })
const ProgressSpringConfig: SpringConfig = {
  mass: 2,
  energyThreshold: 6e-9,
  stiffness: 100,
  damping: 10,
  useDuration: false,
  duration: 550,
  dampingRatio: 1,
};

// ~1ms of bisections per frame
const PENDING_SPRINGS_PER_FRAME = 100;

type SpringSet = {
  current: Float64Array;
  velocity: Float64Array;
  toValue: Float64Array;
  startValue: Float64Array;
  lastTimestamp: Float64Array;
  startTimestamp: Float64Array;
  zeta: Float64Array;
  omega0: Float64Array;
  omega1: Float64Array;
  initialEnergy: Float64Array;
  // config.stiffness after onStart, used by the termination check
  stiffness: Float64Array;
  running: Uint8Array;
  // Duration-based springs whose stiffness isn't solved yet (see setSpring)
  pending: Uint8Array;
};

const createSpringSet = (size: number, initial: Float64Array): SpringSet => ({
  current: initial,
  velocity: new Float64Array(size),
  toValue: new Float64Array(size),
  startValue: new Float64Array(size),
  lastTimestamp: new Float64Array(size),
  startTimestamp: new Float64Array(size),
  zeta: new Float64Array(size),
  omega0: new Float64Array(size),
  omega1: new Float64Array(size),
  initialEnergy: new Float64Array(size),
  stiffness: new Float64Array(size),
  running: new Uint8Array(size),
  pending: new Uint8Array(size),
});

const getAnimationTimestamp = () => {
  'worklet';
  const g = globalThis as unknown as {
    __frameTimestamp?: number;
    _getAnimationTimestamp: () => number;
  };
  return g.__frameTimestamp || g._getAnimationTimestamp();
};

const getEnergy = (
  displacement: number,
  velocity: number,
  stiffness: number,
  mass: number,
) => {
  'worklet';
  // Squares as products: `**` is a slow builtin call in Hermes
  return (
    0.5 * stiffness * (displacement * displacement) +
    0.5 * mass * (velocity * velocity)
  );
};

// From rest (no initial velocity) the energy ratio this solves for doesn't
// depend on the displacement: every square lands on the same stiffness, so
// it's solved once per config instead of once per square (1750 bisections
// of ~40 exp() calls each, all in the frame the text changes).
const restStiffnessCache = { duration: -1, stiffness: 0 };

// Reanimated's bisection target: the energy left after the settling time,
// relative to the initial energy, minus the threshold. Same math, with the
// exponential computed once and squares as products: this runs ~20 times per
// square on every text change.
const settleEnergyError = (
  stiffness: number,
  x0: number,
  v0: number,
  m: number,
  zeta: number,
  settlingDuration: number,
  threshold: number,
) => {
  'worklet';
  const omega0 = Math.sqrt(stiffness / m) * zeta;
  const decay = Math.exp(-omega0 * settlingDuration);
  const xtk = (x0 + (v0 + x0 * omega0) * settlingDuration) * decay;
  const vtk =
    (x0 + (v0 + x0 * omega0) * settlingDuration) * decay * -omega0 +
    (v0 + x0 * omega0) * decay;
  const e0 = 0.5 * stiffness * (x0 * x0) + 0.5 * m * (v0 * v0);
  const etk = 0.5 * stiffness * (xtk * xtk) + 0.5 * m * (vtk * vtk);
  return etk / e0 - threshold;
};

const calculateStiffnessToMatchDuration = (
  x0: number,
  v0: number,
  config: SpringConfig,
) => {
  'worklet';
  // Only DelaySpringConfig is duration-based, so its duration is the key
  if (v0 === 0 && restStiffnessCache.duration === config.duration) {
    return restStiffnessCache.stiffness;
  }
  const { dampingRatio: zeta, energyThreshold: threshold, mass: m } = config;
  const settlingDuration = (config.duration * 1.5) / 1000;

  const func = (stiffness: number) => {
    'worklet';
    return settleEnergyError(
      stiffness,
      x0,
      v0,
      m,
      zeta,
      settlingDuration,
      threshold,
    );
  };

  // bisectRoot (each midpoint is evaluated once instead of twice)
  const precision = threshold * 1e-3;
  let min = Number.EPSILON;
  let max = 8e3;
  const direction = func(max) >= func(min) ? 1 : -1;
  let idx = 100;
  let current = (max + min) / 2;
  let value = func(current);
  while (Math.abs(value) > precision && idx > 0) {
    idx -= 1;
    if (value * direction < 0) {
      min = current;
    } else {
      max = current;
    }
    current = (min + max) / 2;
    value = func(current);
  }
  if (v0 === 0) {
    restStiffnessCache.duration = config.duration;
    restStiffnessCache.stiffness = current;
  }
  return current;
};

// One frame of springOnFrame. Returns true when the spring came to rest.
const stepSpring = (
  s: SpringSet,
  i: number,
  now: number,
  config: SpringConfig,
  // Reanimated clamps a frame's step to 64ms
  maxDeltaTime = 64,
) => {
  'worklet';
  const toValue = s.toValue[i];
  const deltaTime = Math.min(
    Math.max(now - s.lastTimestamp[i], 0),
    maxDeltaTime,
  );
  s.lastTimestamp[i] = now;

  const t = deltaTime / 1000;
  const v0 = s.velocity[i];
  const x0 = s.current[i] - toValue;
  const zeta = s.zeta[i];
  const omega0 = s.omega0[i];

  let position: number;
  let velocity: number;
  if (zeta < 1) {
    const omega1 = s.omega1[i];
    const sin1 = Math.sin(omega1 * t);
    const cos1 = Math.cos(omega1 * t);
    const envelope = Math.exp(-zeta * omega0 * t);
    const frag1 =
      envelope * (sin1 * ((v0 + zeta * omega0 * x0) / omega1) + x0 * cos1);
    position = toValue + frag1;
    velocity =
      -zeta * omega0 * frag1 +
      envelope * (cos1 * (v0 + zeta * omega0 * x0) - omega1 * x0 * sin1);
  } else {
    const envelope = Math.exp(-omega0 * t);
    position = toValue + envelope * (x0 + (v0 + omega0 * x0) * t);
    velocity =
      envelope * -omega0 * (x0 + (v0 + omega0 * x0) * t) +
      envelope * (v0 + omega0 * x0);
  }

  s.current[i] = position;
  s.velocity[i] = velocity;

  const initialEnergy = s.initialEnergy[i];
  const currentEnergy = getEnergy(
    toValue - position,
    velocity,
    s.stiffness[i],
    config.mass,
  );
  if (
    initialEnergy === 0 ||
    currentEnergy / initialEnergy <= config.energyThreshold
  ) {
    s.velocity[i] = 0;
    s.current[i] = toValue;
    s.lastTimestamp[i] = 0;
    s.running[i] = 0;
    return true;
  }
  return false;
};

// Equivalent of sharedValue.set(withSpring(toValue, config)):
// valueSetter + onStart + the immediate first step.
const setSpring = (
  s: SpringSet,
  i: number,
  toValue: number,
  now: number,
  config: SpringConfig,
  reduceMotion: boolean,
  // Leave the stiffness bisection of a duration-based spring for later
  // (resolvePendingSprings). Only valid for a spring that isn't stepped
  // before it is resolved and is already at `now` (dt = 0).
  deferStiffness = false,
) => {
  'worklet';
  const wasRunning = s.running[i] === 1;
  const value = s.current[i];
  // valueSetter skips the animation when the value is already at the target
  // (and drops the running one)
  if (value === toValue) {
    s.running[i] = 0;
    s.pending[i] = 0;
    s.velocity[i] = 0;
    s.lastTimestamp[i] = 0;
    return;
  }
  if (reduceMotion) {
    s.current[i] = toValue;
    s.velocity[i] = 0;
    s.lastTimestamp[i] = 0;
    s.running[i] = 0;
    s.pending[i] = 0;
    return;
  }

  // isTriggeredTwice: same target while the previous spring is still running
  const triggeredTwice =
    wasRunning &&
    s.lastTimestamp[i] !== 0 &&
    s.startTimestamp[i] !== 0 &&
    s.toValue[i] === toValue;

  const x0 = triggeredTwice ? s.startValue[i] : value - toValue;
  s.startValue[i] = x0;
  s.toValue[i] = toValue;

  let velocity = wasRunning ? s.velocity[i] || 0 : 0;
  if ((toValue > value && velocity < 0) || (toValue < value && velocity > 0)) {
    velocity = 0;
  }
  s.velocity[i] = velocity;

  if (
    deferStiffness &&
    config.useDuration &&
    !triggeredTwice &&
    !(velocity === 0 && restStiffnessCache.duration === config.duration)
  ) {
    // The first step below would cover dt = 0: it leaves the position and
    // velocity where they are, so it can wait for the stiffness as well.
    s.pending[i] = 1;
    if (!wasRunning || s.lastTimestamp[i] === 0) {
      s.lastTimestamp[i] = now;
    }
    s.startTimestamp[i] = now;
    s.running[i] = 1;
    return;
  }
  s.pending[i] = 0;

  let stiffness = config.stiffness;
  if (!triggeredTwice) {
    let zeta: number;
    let omega0: number;
    if (config.useDuration) {
      stiffness = calculateStiffnessToMatchDuration(x0, velocity, config);
      zeta = config.dampingRatio;
      omega0 = Math.sqrt(stiffness / config.mass);
    } else {
      zeta = config.damping / (2 * Math.sqrt(config.stiffness * config.mass));
      omega0 = Math.sqrt(config.stiffness / config.mass);
    }
    s.zeta[i] = zeta;
    s.omega0[i] = omega0;
    s.omega1[i] = zeta < 1 ? omega0 * Math.sqrt(1 - zeta ** 2) : 0;
  }
  s.stiffness[i] = stiffness;
  s.initialEnergy[i] = getEnergy(x0, 0, stiffness, config.mass);

  if (!wasRunning || s.lastTimestamp[i] === 0) {
    s.lastTimestamp[i] = now;
  }
  if (!triggeredTwice) {
    s.startTimestamp[i] = now;
  }
  s.running[i] = 1;

  stepSpring(s, i, now, config);
};

// Steps every running spring of the set. Returns 1 if any is still running.
const stepSprings = (s: SpringSet, now: number, config: SpringConfig) => {
  'worklet';
  let anyRunning = 0;
  for (let i = 0; i < s.running.length; i++) {
    // Skip springs started this frame: their first step already ran in setSpring
    if (s.running[i] === 0 || s.lastTimestamp[i] === now) {
      if (s.running[i] === 1) {
        anyRunning = 1;
      }
      continue;
    }
    if (!stepSpring(s, i, now, config)) {
      anyRunning = 1;
    }
  }
  return anyRunning;
};

// Solves the stiffness of springs deferred by setSpring, from the same inputs
// (x0 and v0 are still in startValue and velocity: the spring hasn't moved).
const resolveSpring = (s: SpringSet, i: number, config: SpringConfig) => {
  'worklet';
  const x0 = s.startValue[i];
  const stiffness = calculateStiffnessToMatchDuration(
    x0,
    s.velocity[i],
    config,
  );
  const zeta = config.dampingRatio;
  const omega0 = Math.sqrt(stiffness / config.mass);
  s.zeta[i] = zeta;
  s.omega0[i] = omega0;
  s.omega1[i] = zeta < 1 ? omega0 * Math.sqrt(1 - zeta ** 2) : 0;
  s.stiffness[i] = stiffness;
  s.initialEnergy[i] = getEnergy(x0, 0, stiffness, config.mass);
  s.pending[i] = 0;
};

// Resolves up to `budget` deferred springs. Returns how many are left.
const resolvePendingSprings = (
  s: SpringSet,
  config: SpringConfig,
  budget: number,
) => {
  'worklet';
  let left = 0;
  for (let i = 0; i < s.pending.length; i++) {
    if (s.pending[i] === 1) {
      if (budget > 0) {
        resolveSpring(s, i, config);
        budget -= 1;
      } else {
        left += 1;
      }
    }
  }
  return left;
};

// Moves every running spring of the set straight to `now`, however long ago
// it was last stepped. The termination check still applies: the energy only
// decays, so a spring that would have come to rest on an earlier frame is at
// rest here too.
const advanceSprings = (s: SpringSet, now: number, config: SpringConfig) => {
  'worklet';
  for (let i = 0; i < s.running.length; i++) {
    if (s.pending[i] === 1) {
      resolveSpring(s, i, config);
    }
    if (s.running[i] === 1 && s.lastTimestamp[i] !== now) {
      stepSpring(s, i, now, config, Infinity);
    }
  }
};
