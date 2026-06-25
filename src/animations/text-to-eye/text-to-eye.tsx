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
import type { SkFont, SkRect } from '@shopify/react-native-skia';
import { PressableScale } from 'pressto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Extrapolation,
  interpolate,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

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
  Z_BASE,
  Z_MOVE,
} from './constants';
import {
  ATLAS_COLS,
  ATLAS_HEIGHT,
  ATLAS_WIDTH,
  UNIQUE_CHARS,
  useTextEyeData,
} from './use-text-eye-data';

import type { Particle } from './use-text-eye-data';

interface Props {
  width: number;
  height: number;
}

export const TextToEye = ({ width, height }: Props) => {
  const insets = useSafeAreaInsets();
  const data = useTextEyeData(width, height);
  const progress = useSharedValue(0); // 0 = page, 1 = picture
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
    progress.value = withSpring(next ? 1 : 0, {
      dampingRatio: 1,
      duration: 2500,
    });
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
          { bottom: insets.bottom + 16, right: width * PAGE_MARGIN_FRAC },
        ]}
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
  const { pageXY, eyeXY, delays } = useMemo(() => {
    const px = new Float32Array(N * 2);
    const ex = new Float32Array(N * 2);
    const dl = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const p = particles[i];
      px[i * 2] = p.pageX;
      px[i * 2 + 1] = p.pageY;
      ex[i * 2] = p.eyeX;
      ex[i * 2 + 1] = p.eyeY;
      dl[i] = p.delay;
    }
    return { pageXY: px, eyeXY: ex, delays: dl };
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

    // 3D: surge toward the camera mid-flight, more for letters that travel far.
    const dxm = tx2 - sx;
    const dym = ty2 - sy;
    const moveDist = Math.sqrt(dxm * dxm + dym * dym);
    const normMove = Math.min(moveDist / screenW, 1);
    const eff = Math.sin(pe * PI); // 0 at ends, 1 mid-flight
    const zDepth = eff * (Z_BASE + normMove * Z_MOVE);
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

    // slight tilt in the travel direction
    const rot = eff * ROT_3D * normMove * (dxm >= 0 ? 1 : -1);
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

const FAB_SIZE = 44;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fab: {
    position: 'absolute',
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    borderCurve: 'continuous',
    backgroundColor: '#1c1a17',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
