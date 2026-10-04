import { Image, PixelRatio } from 'react-native';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useSharedValue } from 'react-native-reanimated';
import { Skia } from 'react-native-skia';
import { adoptTexture, importDevice } from 'react-native-webgpu';

import {
  CAMERA_DIST,
  CAMERA_FOV,
  CAMERA_TARGET,
  GLYPH_WORLD,
  INK_HEX,
  SHAPE_LEAN,
  SHAPE_YAW_OFFSET,
} from '../constants';
import { buildGlyphAtlas, loadTypeface } from '../glyph-atlas';
import { buildPageLayout } from '../layout';
import { glyphShader } from '../shaders/glyphs';

/** x, y, z, nx, ny, nz, ao — one point of a baked figure, as float32s. */
const POINT_STRIDE = 7;

import type { PageLayout } from '../layout';
import type { SharedValue } from 'react-native-reanimated';
import type { SkImage } from 'react-native-skia';

const BUST = require('../assets/bust.bin');
const PAGE_FONT = require('../assets/Newsreader.ttf');
const NIKE = require('../assets/nike.bin');
const THINKER = require('../assets/thinker.bin');

/**
 * Two figures on one instance: pos3+nrm3+ao and page2+cell+adv for each, plus
 * a pair saying whether the slot has a seat in either. The figures are
 * different sizes and take different numbers of marks; the surplus fades
 * across the crossing rather than being refused a seat.
 */
const INSTANCE_FLOATS = 36;
// proj 64 + model 48 (mat3: three 16-byte columns) + viewOffset 12 + morph 4
// + pagePlane 12 + scroll 4 + screen 8 + ratio 4 + pageGlyph 4 + bustGlyph 4
// + cellPx 4 + atlasCols 4 + centreY 4 + atlasDims 8 + atlasOrigin 8 + reach 4
// = 196, rounded up to the struct's 16-byte alignment.
const UNIFORM_BYTES = 208;
/** Frames to keep drawing after the clock reaches zero, while Skia takes over. */
const LINGER_FRAMES = 3;
const MAX_PIXEL_RATIO = 3;

const loadBinaryAsset = async (
  asset: ReturnType<typeof require>,
): Promise<Float32Array | null> => {
  const resolved = Image.resolveAssetSource(asset);
  if (!resolved?.uri) {
    return null;
  }
  const response = await fetch(resolved.uri);
  return new Float32Array(await response.arrayBuffer());
};

/** The diagonal of a cloud's bounding box, in its own units. */
const diagonal = (cloud: Float32Array) => {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < cloud.length; i += POINT_STRIDE) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], cloud[i + k]);
      hi[k] = Math.max(hi[k], cloud[i + k]);
    }
  }
  return Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
};

/**
 * Scale a cloud about its origin, in place, so its bounding box has the
 * given diagonal.
 *
 * Each scan arrived normalised on its own terms, and not the same ones: the
 * Venus to a height of two, the Thinker to something that left him as tall as
 * her and twice as broad, so he filled the screen and his marks, a fixed size,
 * sat visibly further apart. One diagonal for all three gives them one scale
 * and, near enough, one density of letters.
 */
const fitDiagonal = (cloud: Float32Array, target: number) => {
  const k = target / diagonal(cloud);
  for (let i = 0; i < cloud.length; i += POINT_STRIDE) {
    cloud[i] *= k;
    cloud[i + 1] *= k;
    cloud[i + 2] *= k;
  }
};

const perspective = (fovy: number, aspect: number, near: number, far: number) =>
  // column-major, matching how WGSL reads a mat4x4f out of a buffer
  new Float32Array([
    1 / (Math.tan(fovy / 2) * aspect),
    0,
    0,
    0,
    0,
    1 / Math.tan(fovy / 2),
    0,
    0,
    0,
    0,
    far / (near - far),
    -1,
    0,
    0,
    (far * near) / (near - far),
    0,
  ]);

/**
 * Turn the figure about its own upright axis, with a slight tilt.
 *
 * Y, because a bust stands up: a glTF model is Y-up, so that is the axis a head
 * turns about. The torus this replaced spun about Z, which was ITS axis — get
 * this wrong and the figure tumbles end over end instead of turning to look at
 * you.
 *
 * The tilt is small and constant: dead level reads as a museum turntable, and
 * a few degrees of nod gives the form somewhere to catch the light.
 */
const writeModelMatrix = (
  out: Float32Array,
  at: number,
  lean: number,
  spin: number,
) => {
  const cl = Math.cos(lean);
  const sl = Math.sin(lean);
  const cs = Math.cos(spin);
  const ss = Math.sin(spin);
  // The 3x3 of rotX(lean) * rotY(spin), multiplied out by hand and written
  // straight into the uniform array. Three columns, each padded to sixteen
  // bytes, which is how WGSL lays out a mat3x3f. The readable version built
  // three 4x4 Float32Arrays and ran a triple loop sixty times a second to
  // arrive at these nine numbers.
  out[at] = cs;
  out[at + 1] = sl * ss;
  out[at + 2] = -cl * ss;
  out[at + 4] = 0;
  out[at + 5] = cl;
  out[at + 6] = sl;
  out[at + 8] = ss;
  out[at + 9] = -sl * cs;
  out[at + 10] = cl * cs;
};

/**
 * Pair each letter on the page with a point on the bust.
 *
 * By angle around each centroid, in order. The obvious alternative — pair by
 * index — makes every letter cross the whole frame to a point chosen at random,
 * and a few thousand crossing paths is visual noise. Sorting both sets by angle
 * and zipping them keeps the paths roughly parallel and mostly short, which is
 * what makes the transition read as one wave rather than a shuffle. Same
 * reasoning as `text-image-morph/sampling.ts`, one dimension up.
 */
const pairByAngle = (
  pageXY: Float32Array,
  bust: Float32Array,
  count: number,
): Int32Array => {
  let pcx = 0;
  let pcy = 0;
  let bcx = 0;
  let bcy = 0;
  for (let i = 0; i < count; i++) {
    pcx += pageXY[i * 2];
    pcy += pageXY[i * 2 + 1];
    bcx += bust[i * POINT_STRIDE];
    bcy += bust[i * POINT_STRIDE + 1];
  }
  pcx /= count;
  pcy /= count;
  bcx /= count;
  bcy /= count;

  const byAngle = (angles: Float64Array) =>
    Array.from({ length: count }, (_, i) => i).sort(
      (a, b) => angles[a] - angles[b],
    );

  const pageAngles = new Float64Array(count);
  const bustAngles = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    // screen y grows downward; flip it so both sets wind the same way
    pageAngles[i] = Math.atan2(pcy - pageXY[i * 2 + 1], pageXY[i * 2] - pcx);
    bustAngles[i] = Math.atan2(
      bust[i * POINT_STRIDE + 1] - bcy,
      bust[i * POINT_STRIDE] - bcx,
    );
  }

  const pageOrder = byAngle(pageAngles);
  const bustOrder = byAngle(bustAngles);
  const bustForPage = new Int32Array(count);
  for (let k = 0; k < count; k++) {
    bustForPage[pageOrder[k]] = bustOrder[k];
  }
  return bustForPage;
};

/**
 * The same winding, between two point clouds.
 *
 * `pairByAngle` matches a flat page to a cloud; this matches two clouds to
 * each other, so a mark high on one shoulder crosses to somewhere high on the
 * next rather than to a plinth.
 */
const pairClouds = (
  a: Float32Array,
  b: Float32Array,
  count: number,
): Int32Array => {
  const centroid = (c: Float32Array) => {
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < count; i++) {
      cx += c[i * POINT_STRIDE];
      cy += c[i * POINT_STRIDE + 1];
    }
    return [cx / count, cy / count] as const;
  };
  const [acx, acy] = centroid(a);
  const [bcx, bcy] = centroid(b);
  const order = (c: Float32Array, cx: number, cy: number) => {
    const angles = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      angles[i] = Math.atan2(
        c[i * POINT_STRIDE + 1] - cy,
        c[i * POINT_STRIDE] - cx,
      );
    }
    return Array.from({ length: count }, (_, i) => i).sort(
      (x, y) => angles[x] - angles[y],
    );
  };
  const aOrder = order(a, acx, acy);
  const bOrder = order(b, bcx, bcy);
  const bForA = new Int32Array(count);
  for (let k = 0; k < count; k++) {
    bForA[aOrder[k]] = bOrder[k];
  }
  return bForA;
};

interface Params {
  width: number;
  height: number;
  /** The articles, in the order the scroll crosses them. */
  texts: readonly string[];
  /** Where the scroll is, in sculptures. */
  cross: SharedValue<number>;
  /** 1 while the letters are on their way back to the page. */
  rewind: SharedValue<number>;
  /** Radians, applied to the figure only. */
  yaw: SharedValue<number>;
  /** How far the column has been pulled up, px. */
  scroll: SharedValue<number>;
  /** The one clock: 0 = page, 1 = figure. */
  progress: SharedValue<number>;
}

export interface PortraitStatus {
  ready: boolean;
  /** The shaped columns, for Skia to paint at rest. */
  pages: readonly PageLayout[] | null;
  /** The rendered shape, as something Skia can draw. Updated every frame. */
  image: SharedValue<SkImage | null>;
  error: string | null;
  /**
   * Fix where the page starts coming apart: the middle of the screen at the
   * given scroll. Called at the tap that starts a morph from rest — never
   * mid-flight, which would move every letter's window under it.
   */
  setOrigin: (scroll: number) => void;
}

export const usePortraitRenderer = ({
  width,
  height,
  texts,
  cross,
  rewind,
  yaw,
  scroll,
  progress,
}: Params): PortraitStatus => {
  const image = useSharedValue<SkImage | null>(null);
  const originRef = useRef<((scroll: number) => void) | null>(null);
  const setOrigin = useCallback((scroll: number) => {
    originRef.current?.(scroll);
  }, []);
  const [status, setStatus] = useState<
    Omit<PortraitStatus, 'image' | 'setOrigin'>
  >({
    ready: false,
    error: null,
    pages: null,
  });

  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (width <= 0 || height <= 0) {
      return;
    }
    let cancelled = false;
    /**
     * Everything this run allocates, released when it ends.
     *
     * The device is Skia's and lives as long as the app, so nothing goes with
     * it: left to the garbage collector, two device-sized targets and the
     * atlas stayed alive after every visit — Hermes does not count native
     * memory, so it was in no hurry to collect them.
     */
    const disposables: (() => void)[] = [];
    const release = () => {
      for (const dispose of disposables.splice(0).reverse()) {
        dispose();
      }
    };

    const init = async () => {
      // One device for both libraries when Skia is on Graphite: the atlas then
      // never leaves the GPU.
      //
      // There is no capability flag to ask: `getNativeDevice` simply throws on
      // a build without Graphite, so the throw IS the feature detection.
      let nativeDevice: bigint;
      try {
        nativeDevice = Skia.getNativeDevice();
      } catch {
        // No second path. There was one — ask WebGPU for its own adapter and
        // upload the atlas by readback — and it could not have worked: the
        // frame this pass renders is handed to Skia as a native texture, and
        // a texture belonging to a device Skia does not own is not something
        // Skia can draw. The fallback ran only where it was guaranteed to
        // fail, so the honest version is to say what is missing.
        setStatus(s => ({ ...s, error: 'needs Skia Graphite' }));
        return;
      }
      const device = importDevice(nativeDevice);
      if (cancelled) {
        return;
      }

      // Nothing is presented to a swapchain: the shape is drawn into a texture
      // that Skia then composites. rgba8unorm because that is what Skia will
      // adopt on the other side.
      const format: GPUTextureFormat = 'rgba8unorm';

      const ratio = Math.min(PixelRatio.get(), MAX_PIXEL_RATIO);
      const typeface = await loadTypeface(PAGE_FONT);
      if (cancelled) {
        return;
      }
      if (!typeface) {
        setStatus(s2 => ({ ...s2, error: 'font failed' }));
        return;
      }

      /**
       * The first column, and straight onto the screen.
       *
       * Everything below this — the other two articles, a megabyte of point
       * data, the atlas, six pairings, the instance buffer, the pipeline — is
       * the figure, and the figure is not visible until it is asked for.
       * Waiting for all of it before showing a word put the first line of type
       * more than a second away.
       */
      const page = buildPageLayout(texts[0], typeface, width, height);
      if (cancelled) {
        return;
      }
      setStatus(s2 => ({ ...s2, pages: [page] }));

      // Now the rest, behind the page the reader is already reading.
      const [bust, nike, thinker] = await Promise.all([
        loadBinaryAsset(BUST),
        loadBinaryAsset(NIKE),
        loadBinaryAsset(THINKER),
      ]);
      if (cancelled) {
        return;
      }
      if (!bust || !nike || !thinker) {
        setStatus(s2 => ({ ...s2, error: 'point cloud missing' }));
        return;
      }

      const bustDiagonal = diagonal(bust);
      fitDiagonal(nike, bustDiagonal);
      fitDiagonal(thinker, bustDiagonal);

      const pages = [
        page,
        ...texts.slice(1).map(t => buildPageLayout(t, typeface, width, height)),
      ];

      /**
       * One sheet for every article.
       *
       * Each layout indexes its marks into its OWN list of distinct glyphs, so
       * three atlases would disagree about what cell 12 is. The union is built
       * once and every `cell` array is remapped into it — and because these
       * are English prose in one face, the union is barely larger than any one
       * of them.
       */
      const unionIds = [...new Set(pages.flatMap(l => l.atlasIds))];
      const unionIndex = new Map(unionIds.map((id, i) => [id, i]));
      const cells = pages.map(layout =>
        Float32Array.from(
          layout.cell,
          c => unionIndex.get(layout.atlasIds[c]) ?? 0,
        ),
      );

      const atlas = buildGlyphAtlas(
        page.font,
        unionIds,
        page.fontSize,
        ratio,
        INK_HEX,
      );
      if (!atlas) {
        setStatus(s2 => ({ ...s2, error: 'atlas failed' }));
        return;
      }

      // Skia typeset it; the coverage crosses to WebGPU on the same device,
      // with no copy when Graphite is on.
      disposables.push(() => atlas.image.dispose());
      const atlasTexture = adoptTexture(
        Skia.Image.MakeNativeTextureFromImage(atlas.image),
      );
      disposables.push(() => atlasTexture.destroy());

      /** What each figure can carry, on its own terms. */
      const countA = Math.min(
        Math.floor(bust.length / POINT_STRIDE),
        pages[0].count,
      );
      const countB = Math.min(
        Math.floor(nike.length / POINT_STRIDE),
        pages[1].count,
      );
      const countC = Math.min(
        Math.floor(thinker.length / POINT_STRIDE),
        pages[2].count,
      );
      const count = Math.max(countA, countB, countC);
      const sharedB = Math.min(countA, countB);
      const sharedC = Math.min(countA, countC);

      /**
       * Three pairings, not one.
       *
       * The instance is indexed by its point on the first figure. It carries a
       * letter of the first article, a letter of the second, and a point on
       * the second figure — and all three relationships have to be angular, or
       * one of the three journeys turns into a shuffle.
       */
      const bustForA = pairByAngle(pages[0].xy, bust, countA);
      const nikeForB = pairByAngle(pages[1].xy, nike, countB);
      const thinkerForC = pairByAngle(pages[2].xy, thinker, countC);
      const nikeForBust = pairClouds(bust, nike, sharedB);
      const thinkerForBust = pairClouds(bust, thinker, sharedC);

      const aAtBust = new Int32Array(countA);
      for (let i = 0; i < countA; i++) {
        aAtBust[bustForA[i]] = i;
      }
      const bAtNike = new Int32Array(countB);
      for (let i = 0; i < countB; i++) {
        bAtNike[nikeForB[i]] = i;
      }
      const cAtThinker = new Int32Array(countC);
      for (let i = 0; i < countC; i++) {
        cAtThinker[thinkerForC[i]] = i;
      }

      const instances = new Float32Array(count * INSTANCE_FLOATS);
      for (let p0 = 0; p0 < count; p0++) {
        const hasA = p0 < countA;
        const q = p0 < sharedB ? nikeForBust[p0] : p0;
        const r = p0 < sharedC ? thinkerForBust[p0] : p0;
        const hasB = q < countB;
        const hasC = r < countC;
        const aSrc = hasA ? p0 : countA - 1;
        const bSrc = hasB ? q : countB - 1;
        const cSrc = hasC ? r : countC - 1;
        const a = aAtBust[aSrc];
        const b = bAtNike[bSrc];
        const c = cAtThinker[cSrc];
        const bi = aSrc * POINT_STRIDE;
        const ni = bSrc * POINT_STRIDE;
        const ti = cSrc * POINT_STRIDE;
        instances.set(
          [
            bust[bi],
            bust[bi + 1],
            bust[bi + 2],
            bust[bi + 6],
            bust[bi + 3],
            bust[bi + 4],
            bust[bi + 5],
            pages[0].xy[a * 2],
            pages[0].xy[a * 2 + 1],
            cells[0][a],
            pages[0].adv[a],
            nike[ni],
            nike[ni + 1],
            nike[ni + 2],
            nike[ni + 6],
            nike[ni + 3],
            nike[ni + 4],
            nike[ni + 5],
            pages[1].xy[b * 2],
            pages[1].xy[b * 2 + 1],
            cells[1][b],
            pages[1].adv[b],
            thinker[ti],
            thinker[ti + 1],
            thinker[ti + 2],
            thinker[ti + 6],
            thinker[ti + 3],
            thinker[ti + 4],
            thinker[ti + 5],
            pages[2].xy[c * 2],
            pages[2].xy[c * 2 + 1],
            cells[2][c],
            pages[2].adv[c],
            hasA ? 1 : 0,
            hasB ? 1 : 0,
            hasC ? 1 : 0,
          ],
          p0 * INSTANCE_FLOATS,
        );
      }

      const instanceBuffer = device.createBuffer({
        size: instances.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      disposables.push(() => instanceBuffer.destroy());
      device.queue.writeBuffer(instanceBuffer, 0, instances);

      const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
      const quadBuffer = device.createBuffer({
        size: quad.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      disposables.push(() => quadBuffer.destroy());
      device.queue.writeBuffer(quadBuffer, 0, quad);

      const uniformBuffer = device.createBuffer({
        size: UNIFORM_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      disposables.push(() => uniformBuffer.destroy());

      const module = device.createShaderModule({ code: glyphShader });
      const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
          module,
          entryPoint: 'vs',
          buffers: [
            {
              arrayStride: 8,
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x2' },
              ],
            },
            {
              arrayStride: INSTANCE_FLOATS * 4,
              stepMode: 'instance',
              attributes: [
                // Packed: occlusion in the position's w, cell and advance in
                // the page origin's zw. Sixteen vertex attributes is the cap,
                // and a third figure does not fit any other way.
                { shaderLocation: 1, offset: 0, format: 'float32x4' },
                { shaderLocation: 2, offset: 16, format: 'float32x3' },
                { shaderLocation: 3, offset: 28, format: 'float32x4' },
                { shaderLocation: 4, offset: 44, format: 'float32x4' },
                { shaderLocation: 5, offset: 60, format: 'float32x3' },
                { shaderLocation: 7, offset: 72, format: 'float32x4' },
                { shaderLocation: 8, offset: 88, format: 'float32x4' },
                { shaderLocation: 9, offset: 104, format: 'float32x3' },
                { shaderLocation: 10, offset: 116, format: 'float32x4' },
                { shaderLocation: 11, offset: 132, format: 'float32x3' },
              ],
            },
          ],
        },
        fragment: {
          module,
          entryPoint: 'fs',
          targets: [
            {
              format,
              blend: {
                // premultiplied: the fragment already multiplied ink by alpha
                color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
              },
            },
          ],
        },
        primitive: { topology: 'triangle-list' },
        // The near wall of the torus has to hide the far one. Fading by normal
        // direction approximates that on a convex form and fails outright on a
        // shape that folds back on itself — which is exactly why the torus is
        // the shape that makes the depth buffer worth having.
        // less-EQUAL, not less. At rest every quad sits on the same plane,
        // and they overlap: a cell is wider than a letter advances. With a
        // strict test the later quad loses wherever it overlaps the earlier
        // one, which is most of its width, including the middle where the
        // letter is. Only the first quad of each line had nothing in front of
        // it — and only the first letter of each line ever showed.
        depthStencil: {
          format: 'depth24plus',
          depthWriteEnabled: true,
          depthCompare: 'less-equal',
        },
      });

      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          {
            binding: 1,
            resource: device.createSampler({
              magFilter: 'linear',
              minFilter: 'linear',
            }),
          },
          { binding: 2, resource: atlasTexture.createView() },
        ],
      });

      // The page sits on the plane through the camera target, so its pixels map
      // to the same screen positions there and it is pin-sharp at rest.
      const halfH = Math.tan(CAMERA_FOV / 2) * CAMERA_DIST;
      const halfW = halfH * (width / height);
      const worldPerPx = (halfH * 2) / height;
      // One atlas cell, at page scale: the cell's device pixels, in points,
      // in world units. With this a full-cell quad on the page plane is
      // exactly one texel per device pixel.
      const pageGlyphWorld = (atlas.cell / ratio) * worldPerPx;

      const uniforms = new Float32Array(UNIFORM_BYTES / 4);
      uniforms.set(perspective(CAMERA_FOV, width / height, 0.1, 100), 0);
      // floats 16-27 are the model rotation, written every frame
      uniforms.set(
        [
          -CAMERA_TARGET[0],
          -CAMERA_TARGET[1],
          -(CAMERA_TARGET[2] + CAMERA_DIST),
        ],
        28,
      );
      // float 31 is the clock, written every frame
      uniforms.set([halfW, halfH, -CAMERA_DIST], 32);
      // float 35 is the scroll, written every frame
      uniforms.set([width, height], 36);
      uniforms[38] = ratio;
      uniforms.set([pageGlyphWorld, GLYPH_WORLD], 39);
      uniforms.set([atlas.cell, atlas.cols], 41);
      // float 43 is the front's origin, set at the tap
      uniforms.set([atlas.width, atlas.height], 44);
      uniforms.set([atlas.originX, atlas.originY], 46);

      // Transparent, premultiplied: this texture is a layer Skia composites
      // over the paper, not the frame itself. Clearing it to the page colour
      // would paint an opaque rectangle over the very page it sits on.
      const clearValue = { r: 0, g: 0, b: 0, a: 0 };

      // The shape is rendered at device resolution into this, every frame, and
      // Skia draws it as an image in the same frame on the same device. It is
      // allocated once: re-creating it per frame would churn a few megabytes a
      // second for nothing.
      const targetW = Math.round(width * ratio);
      const targetH = Math.round(height * ratio);
      const shapeTexture = device.createTexture({
        size: [targetW, targetH],
        format,
        usage:
          GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      disposables.push(() => shapeTexture.destroy());
      // Sized from the colour attachment itself: a depth attachment even one
      // pixel off it fails validation and the pass silently renders nothing.
      const depthTexture = device.createTexture({
        size: [targetW, targetH],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      disposables.push(() => depthTexture.destroy());

      // Views, and the descriptor that names them, built once.
      //
      // A texture view is an immutable handle on a texture that never changes
      // size or format here, and WebGPU reads a pass descriptor at the call
      // rather than holding it, so there is nothing about either that has to
      // be rebuilt. Doing it inside the loop was two JSI objects and a nested
      // literal per frame, allocated on the thread that also runs the reading.
      const passDescriptor: GPURenderPassDescriptor = {
        colorAttachments: [
          {
            view: shapeTexture.createView(),
            clearValue,
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: depthTexture.createView(),
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      };

      // Frames this pass keeps drawing after the last letter lands. Skia is
      // told to show the column through a shared value that crosses to the UI
      // thread, and that can take a frame or two; drawing the (identical)
      // letters over the gap is what keeps it from ever being empty.
      // The departure front's origin, set at the tap. Farthest letter from it
      // is one of the four corners of the column.
      originRef.current = (scrollPx: number) => {
        /**
         * Measured against the column the letters are actually in.
         *
         * This closed over the first article's layout, so `reach` — the
         * distance to the farthest corner of the page — was always the
         * Venus's column however far you had crossed. The three are not the
         * same length: the Thinker runs to 14,869 marks against her 11,809,
         * and a front measured on the wrong one either finishes early or
         * never reaches the end of the page.
         */
        const column =
          pages[
            Math.max(0, Math.min(pages.length - 1, Math.round(cross.get())))
          ];
        const cx = width / 2;
        const cy = scrollPx + height / 2;
        uniforms[43] = cy;
        uniforms[48] = Math.max(
          Math.hypot(cx, cy),
          Math.hypot(width - cx, cy),
          Math.hypot(cx, column.height - cy),
          Math.hypot(width - cx, column.height - cy),
        );
      };
      originRef.current(0);

      let linger = 0;
      let idle = false;

      const frame = () => {
        if (cancelled) {
          return;
        }
        const morph = progress.get();
        if (morph > 0) {
          linger = LINGER_FRAMES;
        } else if (linger > 0) {
          linger--;
        }
        // Nothing to draw and Skia has had its frames to take the column
        // back: the GPU has nothing to do while the article is being read.
        // One more pass clears the layer, then none until the next tap.
        if (morph <= 0 && linger === 0) {
          if (idle) {
            frameRef.current = requestAnimationFrame(frame);
            return;
          }
          idle = true;
        } else {
          idle = false;
        }

        writeModelMatrix(
          uniforms,
          16,
          SHAPE_LEAN,
          yaw.get() + SHAPE_YAW_OFFSET,
        );
        uniforms[31] = morph;
        uniforms[35] = scroll.get();
        uniforms[49] = cross.get();
        uniforms[50] = rewind.get();
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass(passDescriptor);
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.setVertexBuffer(0, quadBuffer);
        pass.setVertexBuffer(1, instanceBuffer);
        pass.draw(6, count);
        pass.end();
        device.queue.submit([encoder.finish()]);

        // Wrapped fresh each frame. An SkImage is a snapshot by contract, so
        // re-using one over a texture that has been redrawn is not something to
        // rely on; the wrapper is a handle, not a copy, so this costs a JSI
        // call and no pixels. The native side takes its own reference, which is
        // why the texture must never be destroyed while a frame is in flight.
        image.set(
          Skia.Image.MakeImageFromNativeTexture(shapeTexture.nativePointer),
        );
        frameRef.current = requestAnimationFrame(frame);
      };

      setStatus({
        ready: true,
        error: null,
        pages,
      });
      frameRef.current = requestAnimationFrame(frame);
    };

    init().catch((e: unknown) => {
      // A run that failed part-way keeps nothing it had built.
      release();
      if (cancelled) {
        return;
      }
      setStatus(s => ({
        ...s,
        error: e instanceof Error ? e.message : String(e),
      }));
    });

    return () => {
      cancelled = true;
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      // Skia may still draw the last image over the shape texture this frame,
      // and a texture must not be destroyed under an image in flight. So the
      // canvas lets go of it first, and the GPU objects go two frames later.
      image.set(null);
      requestAnimationFrame(() => requestAnimationFrame(release));
      // The figure this run built is gone. Should the effect run again, the
      // button must wait for the next one rather than morph into nothing.
      setStatus(s => (s.ready ? { ...s, ready: false } : s));
    };
  }, [width, height, texts, cross, rewind, progress, yaw, scroll, image]);

  return { ...status, image, setOrigin };
};
