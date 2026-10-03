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
  useRSXformBuffer,
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
    return new Array(SquaresAmount).fill(false).map((_, i) => {
      const tx = (i % HSquares) * XSpacing + (XSpacing + scaleFactor) / 2;
      const ty =
        Math.floor(i / HSquares) * YSpacing + (YSpacing + scaleFactor) / 2;

      return animatedText
        .get()
        ?.contains(tx + squareSize / 2, ty + squareSize / 2);
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
        const running =
          stepSprings(state.delay, timestamp, DelaySpringConfig) |
          stepSprings(state.progress, timestamp, ProgressSpringConfig);
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

  // Since we're using the Atlas API, we need to pass a Float32Array as color.
  // The Float32Array accepts 4 values: [R, G, B, A]
  // The idea is to animate organically the alpha value of the color.
  // The interpolation function is a bit tricky because I just played with the values until I got something that I liked.
  // But the main idea was just to make the squares fade in and fade out.
  const colors = useMemo(() => {
    return Array.from({ length: SquaresAmount }, () => {
      // const progress = progressValue.value;
      // const alpha = interpolate(
      //   progress,
      //   [-3, 0, 1, 2],
      //   [0, 0.8, 0, 0],
      //   Extrapolation.CLAMP,
      // );
      return new Float32Array([1, 1, 1, 0.8]);
    });
  }, [SquaresAmount]);

  // We need to provide a texture to the Atlas (We're just saying that the texture is a white by default)
  const texture = useTexture(<Fill color={'white'} />, {
    width: canvasWidth,
    height: canvasHeight,
  });

  // The useRSXformBuffer is a hook provided by Skia that allows us to animate the position and scale of the squares.
  // The idea is that by default, the squares are going to be positioned in a shrinked grid (because of the scaleFactor).
  // When the square gets active, the squares are going to be positioned in a scaled grid
  // If the scaleFactor is 0, the shrinked grid is going to be the same as the scaled grid.
  // The magic happens because of the individual progress shared values and the interpolate function.
  const transforms = useRSXformBuffer(SquaresAmount, (val, i) => {
    'worklet';

    const xShrinkedOffset = (XSpacing + scaleFactor) / 2;
    const yShrinkedOffset = (YSpacing + scaleFactor) / 2;

    const xScaledOffset = ScaledXSpacing / 2;
    const yScaledOffset = ScaledYSpacing / 2;

    const shrinkedTx = (i % HSquares) * XSpacing + xShrinkedOffset;
    const shrinkedTy = Math.floor(i / HSquares) * YSpacing + yShrinkedOffset;

    const scaledTx = (i % HSquares) * ScaledXSpacing + xScaledOffset;
    const scaledTy = Math.floor(i / HSquares) * ScaledYSpacing + yScaledOffset;

    // Subscribes the mapper to the spring loop
    frame.get();
    const prog = springs.get().progress.current[i];
    // Inlined interpolate(prog, [0, 1], ...): same math, without allocating
    // the range arrays 5250 times per frame
    const tx = shrinkedTx + prog * (scaledTx - shrinkedTx);
    const ty = shrinkedTy + prog * (scaledTy - shrinkedTy);

    const translatedX = tx;
    const translatedY = ty;

    // interpolate(prog, [0, 1], [0.6, 0.85], Extrapolation.CLAMP)
    const scale = Math.min(Math.max(0.6 + prog * (0.85 - 0.6), 0.6), 0.85);

    val.set(scale, 0, translatedX, translatedY);
  });

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
      <Atlas
        image={texture}
        sprites={sprites}
        colors={colors}
        transforms={transforms}
      />
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
  return 0.5 * stiffness * displacement ** 2 + 0.5 * mass * velocity ** 2;
};

const calculateStiffnessToMatchDuration = (
  x0: number,
  v0: number,
  config: SpringConfig,
) => {
  'worklet';
  const { dampingRatio: zeta, energyThreshold: threshold, mass: m } = config;
  const settlingDuration = (config.duration * 1.5) / 1000;

  const func = (stiffness: number) => {
    'worklet';
    const omega0 = Math.sqrt(stiffness / m) * zeta;
    const xtk =
      (x0 + (v0 + x0 * omega0) * settlingDuration) *
      Math.exp(-omega0 * settlingDuration);
    const vtk =
      (x0 + (v0 + x0 * omega0) * settlingDuration) *
        Math.exp(-omega0 * settlingDuration) *
        -omega0 +
      (v0 + x0 * omega0) * Math.exp(-omega0 * settlingDuration);
    const e0 = getEnergy(x0, v0, stiffness, m);
    const etk = getEnergy(xtk, vtk, stiffness, m);
    return etk / e0 - threshold;
  };

  // bisectRoot
  const precision = threshold * 1e-3;
  let min = Number.EPSILON;
  let max = 8e3;
  const direction = func(max) >= func(min) ? 1 : -1;
  let idx = 100;
  let current = (max + min) / 2;
  while (Math.abs(func(current)) > precision && idx > 0) {
    idx -= 1;
    if (func(current) * direction < 0) {
      min = current;
    } else {
      max = current;
    }
    current = (min + max) / 2;
  }
  return current;
};

// One frame of springOnFrame. Returns true when the spring came to rest.
const stepSpring = (
  s: SpringSet,
  i: number,
  now: number,
  config: SpringConfig,
) => {
  'worklet';
  const toValue = s.toValue[i];
  const deltaTime = Math.min(Math.max(now - s.lastTimestamp[i], 0), 64);
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
) => {
  'worklet';
  const wasRunning = s.running[i] === 1;
  const value = s.current[i];
  // valueSetter skips the animation when the value is already at the target
  // (and drops the running one)
  if (value === toValue) {
    s.running[i] = 0;
    s.velocity[i] = 0;
    s.lastTimestamp[i] = 0;
    return;
  }
  if (reduceMotion) {
    s.current[i] = toValue;
    s.velocity[i] = 0;
    s.lastTimestamp[i] = 0;
    s.running[i] = 0;
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
