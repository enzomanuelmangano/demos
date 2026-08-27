import { Image, PixelRatio } from 'react-native';

import { useCallback, useEffect, useRef } from 'react';

import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import { CanvasRef } from 'react-native-webgpu';
import { scheduleOnUI } from 'react-native-worklets';

import {
  CORD_ANCHOR_X,
  DEFAULT_SETTINGS,
  PAINTING_CENTER_Y,
  PAINTING_WIDTH_RATIO,
  SURFACE_FAR_Z,
  UNIFORM_BUFFER_SIZE,
} from '../constants';
import { halfHeightOf, PAINTINGS } from '../paintings';
import { relightShader } from '../shaders/relight';
import { advanceLight, bulbExposure, cordAnchorY } from '../state';

import type { LightSettings, LightState, PaintingFacts } from '../state';
import type { SharedValue } from 'react-native-reanimated';

// Surface fields are rgba16float [slopeX, slopeY, occlusion, depth], baked by
// scripts/bake-painting-surface.py. Metro serves .bin verbatim (see
// metro.config.js), so the half-floats reach writeTexture untouched — there is
// no decode step and no precision lost to an 8-bit image container.

const HALF_FLOAT_BYTES = 8; // rgba16float

const MAX_PIXEL_RATIO = 2;

/** The canvas is not measured on the first tick; poll briefly for a layout. */
const INIT_RETRY_MS = 50;
const INIT_MAX_ATTEMPTS = 20;

interface RNWebGPUContext extends GPUCanvasContext {
  present(): void;
}

/** Everything the frame loop needs, in a form that can cross to the UI thread. */
interface RenderBundle {
  device: GPUDevice;
  context: RNWebGPUContext;
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  /** One per possible base page; index by floor(pageShift). */
  bindGroups: GPUBindGroup[];
  paintings: PaintingFacts[];
  fields: Uint16Array[];
  /** Everything the loop owns and must release when it stops. */
  disposables: { destroy: () => void }[];
  width: number;
  height: number;
}

/** Decode a bundled image to tightly packed RGBA8 bytes. */
const loadImagePixels = async (
  asset: ReturnType<typeof require>,
): Promise<{ pixels: Uint8Array; width: number; height: number } | null> => {
  const resolved = Image.resolveAssetSource(asset);
  if (!resolved?.uri) {
    return null;
  }
  const data = await Skia.Data.fromURI(resolved.uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) {
    return null;
  }
  const width = image.width();
  const height = image.height();
  const pixels = image.readPixels(0, 0, {
    width,
    height,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!pixels) {
    return null;
  }
  return { pixels: new Uint8Array(pixels.buffer), width, height };
};

const loadBinaryAsset = async (
  asset: ReturnType<typeof require>,
): Promise<Uint8Array | null> => {
  const resolved = Image.resolveAssetSource(asset);
  if (!resolved?.uri) {
    return null;
  }
  const response = await fetch(resolved.uri);
  return new Uint8Array(await response.arrayBuffer());
};

/**
 * The frame loop, running on the UI thread.
 *
 * Physics, uniform packing, command encoding and present all happen here, so a
 * busy JS thread — navigation, an OTA check, a GC pause — cannot stutter the
 * light or add latency between a finger moving and the bulb following it.
 */
const startFrameLoop = (
  bundle: RenderBundle,
  lightValue: SharedValue<LightState>,
  settingsValue: SharedValue<LightSettings>,
  runningValue: SharedValue<boolean>,
  scrollValue: SharedValue<number>,
  uniforms: ArrayBuffer,
) => {
  'worklet';
  const floats = new Float32Array(uniforms);
  const uints = new Uint32Array(uniforms);
  const { device, context, pipeline, uniformBuffer, paintings, fields } =
    bundle;
  const anchorY = cordAnchorY(bundle.height / bundle.width);
  const paintingWidthPx = bundle.width * PAINTING_WIDTH_RATIO;
  let previous = Date.now();
  // Reused every frame. Rebuilding these literals would churn four objects a
  // frame on the UI thread, where a collection pause costs a visible frame.
  const colorAttachment = {
    view: undefined as unknown as GPUTextureView,
    clearValue: { r: 0, g: 0, b: 0, a: 1 },
    loadOp: 'clear' as const,
    storeOp: 'store' as const,
  };
  const renderPass = { colorAttachments: [colorAttachment] };
  const submission: GPUCommandBuffer[] = [
    undefined as unknown as GPUCommandBuffer,
  ];

  // No 'worklet' directive: this already runs inside one, and marking it turns
  // it into a worklet object rather than a plain callable for rAF.
  const frame = () => {
    if (!runningValue.get()) {
      // Released here rather than from the effect that stops us: the flag only
      // reaches this thread a frame later, so destroying from JS could pull the
      // textures out from under a frame that is still drawing.
      for (let i = 0; i < bundle.disposables.length; i += 1) {
        bundle.disposables[i].destroy();
      }
      bundle.disposables.length = 0;
      return;
    }
    const light = lightValue.get();
    const settings = settingsValue.get();

    const now = Date.now();
    advanceLight(light, settings, (now - previous) / 1000, anchorY);
    previous = now;

    const basePage = Math.max(
      0,
      Math.min(paintings.length - 2, Math.floor(light.pageShift)),
    );
    floats[0] = DEFAULT_SETTINGS.lightColor[0];
    floats[1] = DEFAULT_SETTINGS.lightColor[1];
    floats[2] = DEFAULT_SETTINGS.lightColor[2];
    floats[3] = 1;
    // World units are painting widths: (uv - centre) * worldScale.
    floats[4] = bundle.width / paintingWidthPx;
    floats[5] = bundle.height / paintingWidthPx;
    floats[6] = 0.5;
    floats[7] = PAINTING_CENTER_Y;
    floats[8] = 0.5;
    floats[9] = paintings[basePage].halfHeight;
    floats[10] = 0.5;
    floats[11] = (paintings[basePage + 1] ?? paintings[basePage]).halfHeight;
    floats[12] = light.x;
    floats[13] = light.y;
    floats[14] = CORD_ANCHOR_X;
    floats[15] = anchorY;
    floats[16] = light.z;
    floats[17] = settings.intensity;
    floats[18] = DEFAULT_SETTINGS.exposure;
    floats[19] = DEFAULT_SETTINGS.relief;
    floats[20] = DEFAULT_SETTINGS.specular;
    floats[21] = DEFAULT_SETTINGS.shadow;
    floats[22] = DEFAULT_SETTINGS.occlusion;
    floats[23] = SURFACE_FAR_Z;
    uints[24] = settings.mode;
    floats[25] = settings.cordOpacity;
    floats[26] = DEFAULT_SETTINGS.lightReach;
    floats[27] = DEFAULT_SETTINGS.shadowLift;
    floats[28] = light.pageShift;
    floats[29] = basePage;
    floats[30] = paintings.length;
    floats[31] = paintings[basePage].occludeBulb ? 1 : 0;
    floats[32] = settings.bulbOpacity;
    floats[33] = bulbExposure(light, paintings, fields);
    floats[34] = (paintings[basePage + 1] ?? paintings[basePage]).occludeBulb
      ? 1
      : 0;
    // floats[34..35] are struct padding before the vec4-aligned members.
    // The cord's bounding box, so the shader can skip it for most pixels.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < light.cord.length; i += 1) {
      const node = light.cord[i];
      floats[40 + i * 2] = node.x;
      floats[41 + i * 2] = node.y;
      if (node.x < minX) minX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.x > maxX) maxX = node.x;
      if (node.y > maxY) maxY = node.y;
    }
    floats[36] = minX;
    floats[37] = minY;
    floats[38] = maxX;
    floats[39] = maxY;

    // Published as its own shared value: the paginator animates off this, and
    // mutating a property inside lightValue would never notify Reanimated.
    scrollValue.set(light.pageShift);

    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    const encoder = device.createCommandEncoder();
    // The swapchain hands back a different texture each frame, so this view
    // genuinely cannot be cached — everything around it can.
    colorAttachment.view = context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass(renderPass);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bundle.bindGroups[basePage]);
    pass.draw(3);
    pass.end();
    submission[0] = encoder.finish();
    device.queue.submit(submission);
    context.present();

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
};

export const useRelightRenderer = (
  canvasRef: React.RefObject<CanvasRef | null>,
  lightValue: SharedValue<LightState>,
  settingsValue: SharedValue<LightSettings>,
  runningValue: SharedValue<boolean>,
  scrollValue: SharedValue<number>,
) => {
  const initializedRef = useRef(false);
  // Bumped on every teardown. `initialize` re-reads it after each await, so a
  // screen left during the ~150ms of adapter and asset loading can drop the
  // work rather than hand a dead swapchain a loop nothing is left to stop.
  const generationRef = useRef(0);

  // Once the loop is running, stopping is all this does: the frame loop owns
  // the GPU objects and frees them itself when it sees the flag, which keeps
  // creation and destruction on the same thread. An init still in flight has no
  // loop yet, so the generation bump is what releases its half-built resources.
  const cleanup = useCallback(() => {
    generationRef.current += 1;
    runningValue.set(false);
    initializedRef.current = false;
  }, [runningValue]);

  /**
   * Resolves false when the canvas has not been laid out yet and the caller
   * should ask again; true once it has, whether or not init then succeeded.
   */
  const initialize = useCallback(async () => {
    if (initializedRef.current) {
      return true;
    }
    if (!canvasRef.current) {
      return false;
    }

    const context = canvasRef.current.getContext(
      'webgpu',
    ) as RNWebGPUContext | null;
    if (!context) {
      console.error('[light-on-painting] no webgpu context');
      return true;
    }

    const canvas = context.canvas as HTMLCanvasElement;
    // A canvas measured at zero would put a NaN in every world-space uniform
    // and leave the screen black for good, so wait for a real layout instead.
    if (!canvas.clientWidth || !canvas.clientHeight) {
      return false;
    }

    initializedRef.current = true;
    const generation = generationRef.current;
    // Everything built so far, so an abandoned or failed init leaves nothing
    // behind; on success the frame loop inherits it as its disposables.
    const created: { destroy: () => void }[] = [];
    const release = () => {
      for (let i = 0; i < created.length; i += 1) {
        created[i].destroy();
      }
      created.length = 0;
    };
    const abandoned = () => {
      if (generation === generationRef.current) {
        return false;
      }
      release();
      return true;
    };

    const adapter = await navigator.gpu?.requestAdapter();
    if (abandoned()) {
      return true;
    }
    if (!adapter) {
      console.error('[light-on-painting] no adapter');
      return true;
    }
    const device = await adapter.requestDevice();
    if (abandoned()) {
      return true;
    }
    const format = navigator.gpu.getPreferredCanvasFormat();

    // Every fragment pays for a shadow march, so a 3x buffer costs roughly
    // twice a 2x one for detail this soft-edged image will never show.
    const ratio = Math.min(PixelRatio.get(), MAX_PIXEL_RATIO);
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    context.configure({ device, format, alphaMode: 'opaque' });

    const albedoTextures: GPUTexture[] = [];
    const surfaceTextures: GPUTexture[] = [];
    const fields: Uint16Array[] = [];

    for (const painting of PAINTINGS) {
      const [image, surfaceBytes] = await Promise.all([
        loadImagePixels(painting.albedo),
        loadBinaryAsset(painting.surface),
      ]);
      if (abandoned()) {
        return true;
      }
      if (!image || !surfaceBytes) {
        console.error('[light-on-painting] failed to load', painting.id);
        release();
        return true;
      }

      const albedo = device.createTexture({
        size: [image.width, image.height],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      device.queue.writeTexture(
        { texture: albedo },
        image.pixels as unknown as BufferSource,
        { bytesPerRow: image.width * 4, rowsPerImage: image.height },
        [image.width, image.height],
      );

      const surface = device.createTexture({
        size: [painting.meta.width, painting.meta.height],
        format: 'rgba16float',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      device.queue.writeTexture(
        { texture: surface },
        surfaceBytes as unknown as BufferSource,
        {
          bytesPerRow: painting.meta.width * HALF_FLOAT_BYTES,
          rowsPerImage: painting.meta.height,
        },
        [painting.meta.width, painting.meta.height],
      );

      albedoTextures.push(albedo);
      surfaceTextures.push(surface);
      created.push(albedo, surface);
      // The UI runtime gets its own copy: the bulb's exposure test needs the
      // depth field and now runs there.
      fields.push(
        new Uint16Array(
          surfaceBytes.buffer.slice(
            surfaceBytes.byteOffset,
            surfaceBytes.byteOffset + surfaceBytes.byteLength,
          ),
        ),
      );
    }
    const sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    const uniformBuffer = device.createBuffer({
      size: UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    created.push(uniformBuffer);

    const module = device.createShaderModule({ code: relightShader });
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });

    // Every pairing is built up front, so the UI thread never has to create GPU
    // objects mid-frame — it just picks the one for the page it is on.
    const bindGroups: GPUBindGroup[] = [];
    for (let base = 0; base <= Math.max(0, PAINTINGS.length - 2); base += 1) {
      const next = Math.min(base + 1, PAINTINGS.length - 1);
      bindGroups.push(
        device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: albedoTextures[base].createView() },
            { binding: 2, resource: surfaceTextures[base].createView() },
            { binding: 3, resource: albedoTextures[next].createView() },
            { binding: 4, resource: surfaceTextures[next].createView() },
            { binding: 5, resource: sampler },
          ],
        }),
      );
    }

    const bundle: RenderBundle = {
      device,
      context,
      pipeline,
      uniformBuffer,
      bindGroups,
      paintings: PAINTINGS.map(painting => ({
        halfHeight: halfHeightOf(painting),
        occludeBulb: painting.occludeBulb !== false,
        width: painting.meta.width,
        height: painting.meta.height,
      })),
      fields,
      disposables: created,
      width: canvas.width,
      height: canvas.height,
    };

    if (abandoned()) {
      return true;
    }
    runningValue.set(true);
    scheduleOnUI(
      startFrameLoop,
      bundle,
      lightValue,
      settingsValue,
      runningValue,
      scrollValue,
      new ArrayBuffer(UNIFORM_BUFFER_SIZE),
    );
    return true;
  }, [canvasRef, lightValue, settingsValue, runningValue, scrollValue]);

  useEffect(() => {
    // The canvas reports a zero size for a tick or two after mount; ask again
    // on a short timer until it has been laid out, then stop asking.
    let cancelled = false;
    let attempts = 0;

    const attempt = async () => {
      const laidOut = await initialize();
      if (cancelled || laidOut || attempts >= INIT_MAX_ATTEMPTS) {
        return;
      }
      attempts += 1;
      timeout = setTimeout(attempt, INIT_RETRY_MS);
    };

    let timeout = setTimeout(attempt, INIT_RETRY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      cleanup();
    };
  }, [initialize, cleanup]);
};
