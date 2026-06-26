import { StyleSheet, View } from 'react-native';

import { useMemo, useRef, useState } from 'react';

import { Feather } from '@expo/vector-icons';
import {
  Atlas,
  Canvas,
  Group,
  Text as SkText,
  useColorBuffer,
  useRSXformBuffer,
  useTexture,
} from '@shopify/react-native-skia';
import { SymbolView } from 'expo-symbols';
import { PressableScale } from 'pressto';
import { usePatternComposer } from 'react-native-pulsar';
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
  FADE_AMT,
  GLYPH_CELL,
  GLYPH_PAD,
  INK,
  PAGE_BG,
  PAGE_GLYPH_SCALE,
  PAGE_MARGIN_FRAC,
  PICTURE_GLYPH_SCALE,
  ROT_3D,
  STAGGER,
  Z_BASE,
  Z_MOVE,
} from './constants';
import { MORPH_PATTERN } from './haptics';
import { useTextImageMorph } from './use-text-image-morph';

import type { Atlas as AtlasGeometry, Particle } from './use-text-image-morph';
import type {
  DataSourceParam,
  SkFont,
  SkRect,
} from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

interface Props {
  width: number;
  height: number;
  // the picture the letters assemble into
  image: DataSourceParam;
  // the page of text that flies apart to form it
  paragraph: string;
}

export const TextImageMorph = ({ width, height, image, paragraph }: Props) => {
  const data = useTextImageMorph({ image, paragraph, width, height });
  const progress = useSharedValue(0); // 0 = page, 1 = picture
  const face = useSharedValue(0); // 0 = page icon, 1 = picture icon
  const [revealed, setRevealed] = useState(false);
  const lastToggleRef = useRef(0);
  // Core Haptics pattern timed to the letter motion; scheduled up front on
  // play() so it stays locked to the spring (see haptics.ts).
  const morphHaptic = usePatternComposer(MORPH_PATTERN);

  const toggle = () => {
    const now = Date.now();
    if (now - lastToggleRef.current < 400) {
      return; // debounce double-fire
    }
    lastToggleRef.current = now;
    const next = !revealed;
    setRevealed(next);
    // fire haptics the instant the morph spring starts — synced to the letters
    morphHaptic.play();
    progress.set(
      withSpring(next ? 1 : 0, {
        dampingRatio: 1,
        duration: 2000,
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
            atlas={data.atlas}
            progress={progress}
            screenW={width}
            screenH={height}
            targetsReady={data.targetsReady}
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
  // photo (page state) crossfades to textformat (picture state) with a blur +
  // scale bridge — fast, ease-out, never from scale(0).
  const photoStyle = useAnimatedStyle(() => {
    const f = face.get();
    return {
      opacity: 1 - f,
      transform: [{ scale: 1 - 0.15 * f }],
      filter: [{ blur: 2 * f }],
    };
  });
  const textStyle = useAnimatedStyle(() => {
    const f = face.get();
    return {
      opacity: f,
      transform: [{ scale: 0.85 + 0.15 * f }],
      filter: [{ blur: 2 * (1 - f) }],
    };
  });
  return (
    <View style={styles.iconBox} pointerEvents="none">
      <Animated.View style={[styles.iconLayer, photoStyle]}>
        <SymbolView
          name="photo"
          size={ICON_SIZE}
          weight="semibold"
          tintColor={ICON_COLOR}
          fallback={<Feather name="image" size={17} color={ICON_COLOR} />}
        />
      </Animated.View>
      <Animated.View style={[styles.iconLayer, textStyle]}>
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
  atlas: AtlasGeometry;
  progress: SharedValue<number>;
  screenW: number;
  screenH: number;
  targetsReady: number;
}

const Reveal = ({
  particles,
  sprites,
  font,
  atlas,
  progress,
  screenW,
  screenH,
  targetsReady,
}: RevealProps) => {
  const N = particles.length;

  // Flat typed arrays for cheap reads inside the RSXform worklet. Rebuilt when
  // the deferred sampling fills picX/picY (targetsReady bumps).
  const { pageXY, picXY, delays } = useMemo(() => {
    const px = new Float32Array(N * 2);
    const ex = new Float32Array(N * 2);
    const dl = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const p = particles[i];
      px[i * 2] = p.pageX;
      px[i * 2 + 1] = p.pageY;
      ex[i * 2] = p.picX;
      ex[i * 2 + 1] = p.picY;
      dl[i] = p.delay;
    }
    return { pageXY: px, picXY: ex, delays: dl };
    // targetsReady forces a rebuild after the deferred sampling mutates
    // picX/picY in place (same particles ref, so it isn't auto-detected).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [particles, N, targetsReady]);

  const atlasElement = useMemo(
    () => (
      <Group>
        {atlas.uniqueChars.map((ch, i) => (
          <SkText
            key={i}
            x={(i % atlas.cols) * GLYPH_CELL + GLYPH_PAD}
            y={Math.floor(i / atlas.cols) * GLYPH_CELL + GLYPH_CELL * 0.72}
            text={ch}
            font={font}
            color={INK}
          />
        ))}
      </Group>
    ),
    [font, atlas],
  );

  const texture = useTexture(atlasElement, {
    width: atlas.width,
    height: atlas.height,
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
    const tx2 = picXY[i * 2];
    const ty2 = picXY[i * 2 + 1];

    // flat interpolated position (page -> picture)
    const cx0 = sx + (tx2 - sx) * pe;
    const cy0 = sy + (ty2 - sy) * pe;

    // 3D (art-gallery style): mid-flight the letter surges toward the camera —
    // more the farther it travels — and the scene is perspective-projected
    // toward the centre. Coherent across all letters, so it reads as one big
    // 3D move, not random jitter. Flat at both ends (eff = 0).
    const dxm = tx2 - sx;
    const dym = ty2 - sy;
    const moveDist = Math.sqrt(dxm * dxm + dym * dym);
    const normMove = Math.min(moveDist / screenW, 1);
    const eff = Math.sin(pe * PI); // 0 at ends, 1 mid-flight
    const zDepth = eff * (Z_BASE + normMove * Z_MOVE);
    const persp = CAMERA_Z / (CAMERA_Z - zDepth);

    // perspective projection toward screen centre (the real 3D depth cue)
    const cxC = screenW / 2;
    const cyC = screenH / 2;
    const cx = cxC + (cx0 - cxC) * persp;
    const cy = cyC + (cy0 - cyC) * persp;

    // scale grows with perspective (bigger = nearer)
    const baseScale =
      PAGE_GLYPH_SCALE + (PICTURE_GLYPH_SCALE - PAGE_GLYPH_SCALE) * pe;
    const s = baseScale * persp;

    // tilt in the travel direction, scaled by distance
    const rot = eff * ROT_3D * normMove * (dxm >= 0 ? 1 : -1);
    const scos = s * Math.cos(rot);
    const ssin = s * Math.sin(rot);

    const h = GLYPH_CELL / 2;
    const tx = cx - h * (scos - ssin);
    const ty = cy - h * (ssin + scos);
    val.set(scos, ssin, tx, ty);
  });

  // Per-letter fade that FOLLOWS the ripple: each glyph dims only while it is
  // itself mid-flight (sin(pe*PI) peak using that letter's own staggered phase),
  // crisp at rest. srcIn blend scales the sprite's alpha by the colour's alpha.
  const colors = useColorBuffer(N, (val, i) => {
    'worklet';
    const p = progress.get();
    const d = delays[i];
    const pe = interpolate(
      p,
      [d * STAGGER, d * STAGGER + (1 - STAGGER)],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const eff = Math.sin(pe * Math.PI); // 0 at ends, 1 mid-flight for THIS letter
    const a = 1 - eff * FADE_AMT;
    // srcIn (color = src, glyph = dst): output = colour, masked by the glyph's
    // coverage. The colour carries the INK and the per-letter fade; the atlas
    // only supplies the glyph shape.
    val[0] = 0.11; // #1c1a17
    val[1] = 0.102;
    val[2] = 0.09;
    val[3] = a;
  });

  if (!texture) {
    return null;
  }
  return (
    <Atlas
      image={texture}
      sprites={sprites}
      transforms={transforms}
      colors={colors}
      colorBlendMode="srcIn"
    />
  );
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
    alignItems: 'center',
    height: ICON_SIZE,
    justifyContent: 'center',
    width: ICON_SIZE,
  },
  iconLayer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
});
