import { useMemo } from 'react';

import {
  Atlas,
  Group,
  Text as SkText,
  useColorBuffer,
  useRSXformBuffer,
  useTexture,
} from '@shopify/react-native-skia';
import {
  Extrapolation,
  interpolate,
  type SharedValue,
} from 'react-native-reanimated';

import {
  CAMERA_Z,
  FADE_AMT,
  GLYPH_CELL,
  GLYPH_PAD,
  INK,
  PAGE_GLYPH_SCALE,
  PICTURE_GLYPH_SCALE,
  ROT_3D,
  STAGGER,
  Z_BASE,
  Z_MOVE,
} from './constants';

import type { Atlas as AtlasGeometry } from './atlas';
import type { MorphTargets } from './sampling';
import type { SkFont, SkRect } from '@shopify/react-native-skia';

// 0 before a letter starts moving, 1 once it has landed (offset by its delay).
const letterPhase = (p: number, d: number): number => {
  'worklet';
  return interpolate(
    p,
    [d * STAGGER, d * STAGGER + (1 - STAGGER)],
    [0, 1],
    Extrapolation.CLAMP,
  );
};

interface Props {
  pageXY: Float32Array;
  sprites: SkRect[];
  font: SkFont;
  atlas: AtlasGeometry;
  targets: MorphTargets | null;
  progress: SharedValue<number>;
  screenW: number;
  screenH: number;
}

export const Reveal = ({
  pageXY,
  sprites,
  font,
  atlas,
  targets,
  progress,
  screenW,
  screenH,
}: Props) => {
  const N = sprites.length;

  // before sampling lands, target = page (no travel) so the morph is a no-op
  const picXY = targets?.picXY ?? pageXY;
  const delays = useMemo(
    () => targets?.delays ?? new Float32Array(N),
    [targets, N],
  );

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
    const pe = letterPhase(progress.get(), delays[i]);

    const sx = pageXY[i * 2];
    const sy = pageXY[i * 2 + 1];
    const tx2 = picXY[i * 2];
    const ty2 = picXY[i * 2 + 1];

    const cx0 = sx + (tx2 - sx) * pe;
    const cy0 = sy + (ty2 - sy) * pe;

    // mid-flight surge toward the camera (more the farther it travels),
    // perspective-projected toward centre; flat at both ends
    const dxm = tx2 - sx;
    const dym = ty2 - sy;
    const moveDist = Math.sqrt(dxm * dxm + dym * dym);
    const normMove = Math.min(moveDist / screenW, 1);
    const eff = Math.sin(pe * PI);
    const zDepth = eff * (Z_BASE + normMove * Z_MOVE);
    const persp = CAMERA_Z / (CAMERA_Z - zDepth);

    const cxC = screenW / 2;
    const cyC = screenH / 2;
    const cx = cxC + (cx0 - cxC) * persp;
    const cy = cyC + (cy0 - cyC) * persp;

    const baseScale =
      PAGE_GLYPH_SCALE + (PICTURE_GLYPH_SCALE - PAGE_GLYPH_SCALE) * pe;
    const s = baseScale * persp;

    const rot = eff * ROT_3D * normMove * (dxm >= 0 ? 1 : -1);
    const scos = s * Math.cos(rot);
    const ssin = s * Math.sin(rot);

    const h = GLYPH_CELL / 2;
    val.set(scos, ssin, cx - h * (scos - ssin), cy - h * (ssin + scos));
  });

  // per-letter fade: each glyph dims only while mid-flight. srcIn = colour
  // carries the INK + alpha, atlas carries the shape.
  const colors = useColorBuffer(N, (val, i) => {
    'worklet';
    const eff = Math.sin(letterPhase(progress.get(), delays[i]) * Math.PI);
    val[0] = 0.11; // #1c1a17
    val[1] = 0.102;
    val[2] = 0.09;
    val[3] = 1 - eff * FADE_AMT;
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
