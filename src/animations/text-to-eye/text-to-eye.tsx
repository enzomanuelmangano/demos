import { StyleSheet, View } from 'react-native';

import { useMemo, useRef, useState } from 'react';

import { Ionicons } from '@expo/vector-icons';

import {
  Atlas,
  Canvas,
  Group,
  Text as SkText,
  useRSXformBuffer,
  useTexture,
} from '@shopify/react-native-skia';
import { PressableScale } from 'pressto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Easing,
  Extrapolation,
  interpolate,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  EYE_GLYPH_SCALE,
  GLYPH_CELL,
  GLYPH_PAD,
  INK,
  PAGE_BG,
  PAGE_GLYPH_SCALE,
  STAGGER,
} from './constants';
import {
  ATLAS_COLS,
  ATLAS_HEIGHT,
  ATLAS_WIDTH,
  GLYPH_FONT,
  UNIQUE_CHARS,
  useTextEyeData,
} from './use-text-eye-data';

interface Props {
  width: number;
  height: number;
}

export const TextToEye = ({ width, height }: Props) => {
  const insets = useSafeAreaInsets();
  const data = useTextEyeData(width, height);
  const progress = useSharedValue(0); // 0 = page, 1 = eye
  const [revealed, setRevealed] = useState(false);
  const lastToggleRef = useRef(0);

  const N = data.particles.length;

  // Flat typed arrays for cheap reads inside the RSXform worklet.
  const { pageXY, eyeXY, delays } = useMemo(() => {
    const px = new Float32Array(N * 2);
    const ex = new Float32Array(N * 2);
    const dl = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const p = data.particles[i];
      px[i * 2] = p.pageX;
      px[i * 2 + 1] = p.pageY;
      ex[i * 2] = p.eyeX;
      ex[i * 2 + 1] = p.eyeY;
      dl[i] = p.delay;
    }
    return { pageXY: px, eyeXY: ex, delays: dl };
  }, [data.particles, N]);

  // Offscreen atlas: each unique char baked into its grid cell.
  const atlasElement = useMemo(() => {
    return (
      <Group>
        {UNIQUE_CHARS.map((ch, i) => {
          const cx = (i % ATLAS_COLS) * GLYPH_CELL;
          const cy = Math.floor(i / ATLAS_COLS) * GLYPH_CELL;
          return (
            <SkText
              key={i}
              x={cx + GLYPH_PAD}
              y={cy + GLYPH_CELL * 0.72}
              text={ch}
              font={GLYPH_FONT}
              color={INK}
            />
          );
        })}
      </Group>
    );
  }, []);

  const texture = useTexture(atlasElement, {
    width: ATLAS_WIDTH,
    height: ATLAS_HEIGHT,
  });

  const transforms = useRSXformBuffer(N, (val, i) => {
    'worklet';
    const p = progress.get();
    const d = delays[i];
    // staggered per-particle progress (reading order)
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

    const cx = sx + (tx2 - sx) * pe;
    const cy = sy + (ty2 - sy) * pe;

    const scale = PAGE_GLYPH_SCALE + (EYE_GLYPH_SCALE - PAGE_GLYPH_SCALE) * pe;
    const half = (GLYPH_CELL / 2) * scale;

    val.set(scale, 0, cx - half, cy - half);
  });

  const toggle = () => {
    const now = Date.now();
    if (now - lastToggleRef.current < 400) {
      return; // debounce double-fire
    }
    lastToggleRef.current = now;
    const next = !revealed;
    setRevealed(next);
    progress.value = withTiming(next ? 1 : 0, {
      duration: 1600,
      easing: Easing.inOut(Easing.cubic),
    });
  };

  return (
    <View style={[styles.fill, { backgroundColor: PAGE_BG }]}>
      <Canvas style={styles.fill}>
        {data.ready && (
          <Atlas
            image={texture}
            sprites={data.sprites}
            transforms={transforms}
          />
        )}
      </Canvas>

      <PressableScale
        style={[styles.fab, { top: insets.top + 8 }]}
        onPress={toggle}>
        <Ionicons
          name={revealed ? 'book-outline' : 'eye-outline'}
          size={22}
          color="#efe7d6"
        />
      </PressableScale>
    </View>
  );
};

const FAB_SIZE = 44;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fab: {
    position: 'absolute',
    right: 14,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    borderCurve: 'continuous',
    backgroundColor: '#1c1a17',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
