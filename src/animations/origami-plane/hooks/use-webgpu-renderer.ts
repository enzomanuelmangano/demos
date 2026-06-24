import { PixelRatio } from 'react-native';

import { useCallback, useEffect, useRef } from 'react';

import { CanvasRef } from 'react-native-webgpu';

import {
  BG_RGB,
  CAMERA_EYE,
  CAMERA_FOV,
  CAMERA_TARGET,
  LIGHT_DIR,
  UNIFORM_BUFFER_SIZE,
} from '../constants';
import {
  createGeometry,
  FLOATS_PER_VERTEX,
  STEP_COUNT,
  writeVertices,
} from '../fold/engine';
import { mat4 } from '../fold/math';
import { isSettled, springStep } from '../fold/spring';
import {
  fragmentShader,
  shadowFragmentShader,
  shadowVertexShader,
  vertexShader,
} from '../shaders';

import type { FoldGeometry } from '../fold/engine';
import type { Vec3 } from '../fold/math';

export interface RendererState {
  targetStep: number;
}

interface RNWebGPUContext extends GPUCanvasContext {
  present(): void;
}

interface GPUResources {
  device: GPUDevice;
  context: RNWebGPUContext;
  pipeline: GPURenderPipeline;
  shadowPipeline: GPURenderPipeline;
  bindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
  vertexBuffer: GPUBuffer;
  depthTexture: GPUTexture;
}

export function useWebGPURenderer(
  canvasRef: React.RefObject<CanvasRef | null>,
  stateRef: React.RefObject<RendererState>,
  layoutRef: React.RefObject<{ width: number; height: number }>,
) {
  const resourcesRef = useRef<GPUResources | null>(null);
  const animationRef = useRef<number | null>(null);
  const geometryRef = useRef<FoldGeometry>(createGeometry());
  const progressRef = useRef({ position: 0, velocity: 0 });
  const lastFrameTimeRef = useRef<number>(Date.now());
  const isInitializedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (resourcesRef.current) {
      const { depthTexture, vertexBuffer, uniformBuffer } =
        resourcesRef.current;
      vertexBuffer.destroy();
      uniformBuffer.destroy();
      depthTexture.destroy();
      resourcesRef.current = null;
    }
    isInitializedRef.current = false;
  }, []);

  const render = useCallback(() => {
    const resources = resourcesRef.current;
    const state = stateRef.current;
    const layout = layoutRef.current;
    if (!resources || !state || !layout) return;

    const {
      device,
      context,
      pipeline,
      shadowPipeline,
      bindGroup,
      uniformBuffer,
      vertexBuffer,
      depthTexture,
    } = resources;

    const now = Date.now();
    const dt = Math.min((now - lastFrameTimeRef.current) / 1000, 0.05);
    lastFrameTimeRef.current = now;

    // Ease fold progress toward the target step.
    const target = state.targetStep;
    const prog = progressRef.current;
    const spring = springStep(prog.position, prog.velocity, target, dt);
    prog.position = spring.position;
    prog.velocity = spring.velocity;
    if (isSettled(prog.position, prog.velocity, target)) {
      prog.position = target;
      prog.velocity = 0;
    }

    // Rebuild the folded mesh and upload it.
    const geo = geometryRef.current;
    writeVertices(geo, prog.position);
    device.queue.writeBuffer(
      vertexBuffer,
      0,
      geo.vertexData as unknown as BufferSource,
    );

    // Fixed 3/4 perspective camera, no orbit.
    const eye: Vec3 = CAMERA_EYE;
    const aspect = layout.height > 0 ? layout.width / layout.height : 1;
    const proj = mat4.perspectiveZO(CAMERA_FOV, aspect, 0.1, 50);
    const view = mat4.lookAt(eye, CAMERA_TARGET, [0, 1, 0]);
    const viewProj = mat4.multiply(proj, view);

    // Ground plane rides just under the model's lowest point so the projected
    // shadow stays a contact shadow at every step (carried in lightDir.w).
    const groundY = geo.minY - 0.03;

    const uniformData = new Float32Array(UNIFORM_BUFFER_SIZE / 4);
    uniformData.set(viewProj, 0);
    // Single light, shared by the paper shading, the inter-layer contact shadow,
    // and the ground shadow (constants.LIGHT_DIR). Raking so folded facets read.
    uniformData.set([LIGHT_DIR[0], LIGHT_DIR[1], LIGHT_DIR[2], groundY], 16);
    // Pass raw fold progress so the shader can reveal each crease only at the
    // step that actually creates it.
    uniformData.set([eye[0], eye[1], eye[2], prog.position], 20);
    device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: BG_RGB.r, g: BG_RGB.g, b: BG_RGB.b, a: 1 },
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
    });
    // Ground shadow first (no depth write), then the crane over it.
    renderPass.setBindGroup(0, bindGroup);
    renderPass.setVertexBuffer(0, vertexBuffer);
    renderPass.setPipeline(shadowPipeline);
    renderPass.draw(geo.vertexCount);
    renderPass.setPipeline(pipeline);
    renderPass.draw(geo.vertexCount);
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);
    context.present();

    animationRef.current = requestAnimationFrame(render);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateRef, layoutRef]);

  const initWebGPU = useCallback(async () => {
    if (!canvasRef.current || isInitializedRef.current) return;

    const context = canvasRef.current.getContext(
      'webgpu',
    ) as RNWebGPUContext | null;
    if (!context) {
      console.error('[Origami] Failed to get WebGPU context');
      return;
    }

    try {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) {
        console.error('[Origami] No adapter');
        return;
      }
      const device = await adapter.requestDevice();
      const format = navigator.gpu.getPreferredCanvasFormat();

      const canvas = context.canvas as HTMLCanvasElement;
      canvas.width = canvas.clientWidth * PixelRatio.get();
      canvas.height = canvas.clientHeight * PixelRatio.get();
      context.configure({ device, format, alphaMode: 'opaque' });

      const geo = geometryRef.current;

      const uniformBuffer = device.createBuffer({
        size: UNIFORM_BUFFER_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const vertexBuffer = device.createBuffer({
        size: geo.vertexData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });

      const bindGroupLayout = device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
          },
        ],
      });

      const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
      });

      const pipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({
          bindGroupLayouts: [bindGroupLayout],
        }),
        vertex: {
          module: device.createShaderModule({ code: vertexShader }),
          entryPoint: 'main',
          buffers: [
            {
              arrayStride: FLOATS_PER_VERTEX * 4,
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x3' },
                { shaderLocation: 1, offset: 12, format: 'float32x3' },
                { shaderLocation: 2, offset: 24, format: 'float32x2' },
              ],
            },
          ],
        },
        fragment: {
          module: device.createShaderModule({ code: fragmentShader }),
          entryPoint: 'main',
          targets: [{ format }],
        },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: {
          depthWriteEnabled: true,
          depthCompare: 'less',
          format: 'depth24plus',
        },
      });

      // Translucent planar shadow projected onto the ground plane. Shares the
      // vertex buffer + uniforms; alpha-blends and does not write depth.
      const shadowPipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({
          bindGroupLayouts: [bindGroupLayout],
        }),
        vertex: {
          module: device.createShaderModule({ code: shadowVertexShader }),
          entryPoint: 'main',
          buffers: [
            {
              arrayStride: FLOATS_PER_VERTEX * 4,
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x3' },
                { shaderLocation: 1, offset: 12, format: 'float32x3' },
              ],
            },
          ],
        },
        fragment: {
          module: device.createShaderModule({ code: shadowFragmentShader }),
          entryPoint: 'main',
          targets: [
            {
              format,
              blend: {
                color: {
                  srcFactor: 'src-alpha',
                  dstFactor: 'one-minus-src-alpha',
                  operation: 'add',
                },
                alpha: {
                  srcFactor: 'one',
                  dstFactor: 'one-minus-src-alpha',
                  operation: 'add',
                },
              },
            },
          ],
        },
        primitive: { topology: 'triangle-list', cullMode: 'none' },
        depthStencil: {
          depthWriteEnabled: false,
          depthCompare: 'less',
          format: 'depth24plus',
        },
      });

      const depthTexture = device.createTexture({
        size: [canvas.width, canvas.height],
        format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });

      resourcesRef.current = {
        device,
        context,
        pipeline,
        shadowPipeline,
        bindGroup,
        uniformBuffer,
        vertexBuffer,
        depthTexture,
      };

      isInitializedRef.current = true;
      lastFrameTimeRef.current = Date.now();
      animationRef.current = requestAnimationFrame(render);
    } catch (e) {
      console.error('[Origami] Initialization failed:', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, render]);

  useEffect(() => {
    const timeoutId = setTimeout(initWebGPU, 50);
    return () => {
      clearTimeout(timeoutId);
      cleanup();
    };
  }, [initWebGPU, cleanup]);

  return { stepCount: STEP_COUNT };
}
