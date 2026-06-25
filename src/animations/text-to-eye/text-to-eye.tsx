import { StyleSheet, View } from 'react-native';

import { useMemo, useRef, useState } from 'react';

import { Feather } from '@expo/vector-icons';
import {
  Atlas,
  Canvas,
  Group,
  Text as SkText,
  useRSXformBuffer,
  useTexture,
} from '@shopify/react-native-skia';
import { SymbolView } from 'expo-symbols';
import { PressableScale } from 'pressto';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import {
  CAMERA_Z,
  EYE_GLYPH_SCALE,
  GLYPH_CELL,
  GLYPH_PAD,
  INK,
  PAGE_BG,
  PAGE_GLYPH_SCALE,
  PAGE_MARGIN_FRAC,
  ROT_3D,
  STAGGER,
  Z_NEAR_MAX,
  Z_NEAR_MIN,
} from './constants';
import {
  ATLAS_COLS,
  ATLAS_HEIGHT,
  ATLAS_WIDTH,
  UNIQUE_CHARS,
  useTextEyeData,
} from './use-text-eye-data';

import type { Particle } from './use-text-eye-data';
import type { SkFont, SkRect } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

interface Props {
  width: number;
  height: number;
}

export const TextToEye = ({ width, height }: Props) => {
  const data = useTextEyeData(width, height);
  const progress = useSharedValue(0); // 0 = page, 1 = picture
  const face = useSharedValue(0); // 0 = aperture icon, 1 = book icon
  const [revealed, setRevealed] = useState(false);
  const lastToggleRef = useRef(0);

  const toggle = () => {
    const now = Date.now();
    if (now - lastToggleRef.current < 400) {
      return; // debounce double-fire
    }
    lastToggleRef.current = now;
    const next = !revealed;
    setRevealed(next);
    progress.set(
      withSpring(next ? 1 : 0, {
        dampingRatio: 1,
        duration: 1400,
      }),
    );
    // fast, blur-bridged icon crossfade (Emil Kowalski's tips)
    face.set(
      withTiming(next ? 1 : 0, {
        duration: 240,
        easing: Easing.out(Easing.cubic),
      }),
    );
  };

  return (
    <View style={[styles.fill, { backgroundColor: PAGE_BG }]}>
      <Canvas style={styles.fill}>
        {data.ready && data.font && (
          // Mounted only once the bundled font is ready, so the offscreen
          // glyph atlas (useTexture) bakes with glyphs present.
          <Reveal
            particles={data.particles}
            sprites={data.sprites}
            font={data.font}
            progress={progress}
            screenW={width}
            screenH={height}
          />
        )}
      </Canvas>

      <PressableScale
        style={[
          styles.fab,
          {
            bottom: width * PAGE_MARGIN_FRAC,
            right: width * PAGE_MARGIN_FRAC,
          },
        ]}
        onPress={toggle}>
        <ToggleIcon face={face} />
      </PressableScale>
    </View>
  );
};

const ICON_COLOR = '#efe7d6';
const ICON_SIZE = 20;

const ToggleIcon = ({ face }: { face: SharedValue<number> }) => {
  // aperture (page state) crossfades to book (picture state) with a blur +
  // scale bridge — fast, ease-out, never from scale(0).
  const apertureStyle = useAnimatedStyle(() => {
    const f = face.get();
    return {
      opacity: 1 - f,
      transform: [{ scale: 1 - 0.15 * f }],
      filter: [{ blur: 2 * f }],
    };
  });
  const bookStyle = useAnimatedStyle(() => {
    const f = face.get();
    return {
      opacity: f,
      transform: [{ scale: 0.85 + 0.15 * f }],
      filter: [{ blur: 2 * (1 - f) }],
    };
  });
  return (
    <View style={styles.iconBox} pointerEvents="none">
      <Animated.View style={[styles.iconLayer, apertureStyle]}>
        <SymbolView
          name="photo"
          size={ICON_SIZE}
          weight="semibold"
          tintColor={ICON_COLOR}
          fallback={<Feather name="image" size={17} color={ICON_COLOR} />}
        />
      </Animated.View>
      <Animated.View style={[styles.iconLayer, bookStyle]}>
        <SymbolView
          name="textformat"
          size={ICON_SIZE}
          weight="semibold"
          tintColor={ICON_COLOR}
          fallback={<Feather name="type" size={17} color={ICON_COLOR} />}
        />
      </Animated.View>
    </View>
  );
};

interface RevealProps {
  particles: Particle[];
  sprites: SkRect[];
  font: SkFont;
  progress: SharedValue<number>;
  screenW: number;
  screenH: number;
}

const Reveal = ({
  particles,
  sprites,
  font,
  progress,
  screenW,
  screenH,
}: RevealProps) => {
  const N = particles.length;

  // Flat typed arrays for cheap reads inside the RSXform worklet.
  const { pageXY, eyeXY, delays, depths } = useMemo(() => {
    const px = new Float32Array(N * 2);
    const ex = new Float32Array(N * 2);
    const dl = new Float32Array(N);
    const dp = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const p = particles[i];
      px[i * 2] = p.pageX;
      px[i * 2 + 1] = p.pageY;
      ex[i * 2] = p.eyeX;
      ex[i * 2 + 1] = p.eyeY;
      dl[i] = p.delay;
      dp[i] = p.depth;
    }
    return { pageXY: px, eyeXY: ex, delays: dl, depths: dp };
  }, [particles, N]);

  const atlasElement = useMemo(
    () => (
      <Group>
        {UNIQUE_CHARS.map((ch, i) => (
          <SkText
            key={i}
            x={(i % ATLAS_COLS) * GLYPH_CELL + GLYPH_PAD}
            y={Math.floor(i / ATLAS_COLS) * GLYPH_CELL + GLYPH_CELL * 0.72}
            text={ch}
            font={font}
            color={INK}
          />
        ))}
      </Group>
    ),
    [font],
  );

  const texture = useTexture(atlasElement, {
    width: ATLAS_WIDTH,
    height: ATLAS_HEIGHT,
  });

  const transforms = useRSXformBuffer(N, (val, i) => {
    'worklet';
    const PI = Math.PI;
    const p = progress.get();
    const d = delays[i];
    const pe = interpolate(
      p,
      [d * STAGGER, d * STAGGER + (1 - STAGGER)],
      [0, 1],
      Extrapolation.CLAMP,
    );

    const sx = pageXY[i * 2];
    const sy = pageXY[i * 2 + 1];
    const tx2 = eyeXY[i * 2];
    const ty2 = eyeXY[i * 2 + 1];

    // flat interpolated position (page -> picture)
    const cx0 = sx + (tx2 - sx) * pe;
    const cy0 = sy + (ty2 - sy) * pe;

    // 3D: each letter surges toward the camera by its OWN depth, mid-flight.
    const depth = depths[i];
    const eff = Math.sin(pe * PI); // 0 at ends, 1 mid-flight
    const zDepth = eff * (Z_NEAR_MIN + (Z_NEAR_MAX - Z_NEAR_MIN) * depth);
    const persp = CAMERA_Z / (CAMERA_Z - zDepth);

    // perspective pulls the point toward screen centre as it nears the camera
    const cxC = screenW / 2;
    const cyC = screenH / 2;
    const cx = cxC + (cx0 - cxC) * persp;
    const cy = cyC + (cy0 - cyC) * persp;

    // scale grows with perspective (bigger = nearer)
    const baseScale =
      PAGE_GLYPH_SCALE + (EYE_GLYPH_SCALE - PAGE_GLYPH_SCALE) * pe;
    const s = baseScale * persp;

    // slight per-letter tilt (direction varies with depth)
    const rot = eff * ROT_3D * (depth - 0.5) * 2;
    const scos = s * Math.cos(rot);
    const ssin = s * Math.sin(rot);

    const h = GLYPH_CELL / 2;
    const tx = cx - h * (scos - ssin);
    const ty = cy - h * (ssin + scos);
    val.set(scos, ssin, tx, ty);
  });

  if (!texture) {
    return null;
  }
  return <Atlas image={texture} sprites={sprites} transforms={transforms} />;
};

const FAB_SIZE = 48;

const styles = StyleSheet.create({
  fab: {
    alignItems: 'center',
    backgroundColor: '#1c1a17',
    borderCurve: 'continuous',
    borderRadius: FAB_SIZE / 2,
    height: FAB_SIZE,
    justifyContent: 'center',
    position: 'absolute',
    width: FAB_SIZE,
  },
  fill: { flex: 1 },
  iconBox: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
