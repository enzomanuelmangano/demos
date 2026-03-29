import {
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import React, { useCallback, useEffect, useRef } from 'react';

import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  withTiming,
  useDerivedValue,
  Easing,
} from 'react-native-reanimated';
import { Canvas, CanvasRef } from 'react-native-wgpu';

const GRID_SIZE = 80;
const STEP_LABELS = ['Flat', 'Fold'];
const NUM_STEPS = STEP_LABELS.length;

// Isometric projection: 30° angles, no perspective
// Top face: lightest, Left face: medium, Right face: darkest
const vertexShader = /* wgsl */ `
struct Uniforms {
  aspectRatio: f32,
  foldProgress: f32,
  padding1: f32,
  padding2: f32,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) normal: vec3f,
  @location(1) uv: vec2f,
  @location(2) worldPos: vec3f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Isometric projection matrix (no perspective, 30° angles)
fn isometricProject(p: vec3f) -> vec2f {
  // Standard isometric: rotate 45° around Y, then ~35.264° around X
  // This gives the classic 30° angle appearance
  let isoAngle = 0.615479709; // atan(1/sqrt(2)) ≈ 35.264°

  // Rotate around Y by 45°
  let cosY = 0.7071067812; // cos(45°)
  let sinY = 0.7071067812; // sin(45°)
  let rx = p.x * cosY - p.z * sinY;
  let rz = p.x * sinY + p.z * cosY;

  // Rotate around X by isoAngle
  let cosX = cos(isoAngle);
  let sinX = sin(isoAngle);
  let ry = p.y * cosX - rz * sinX;

  // Orthographic projection (no perspective)
  return vec2f(rx, ry);
}

@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOutput {
  var output: VertexOutput;

  let gridSize = ${GRID_SIZE}u;
  let cellX = instanceIndex % gridSize;
  let cellY = instanceIndex / gridSize;

  let quadVertices = array<vec2f, 6>(
    vec2f(0.0, 0.0),
    vec2f(1.0, 0.0),
    vec2f(0.0, 1.0),
    vec2f(0.0, 1.0),
    vec2f(1.0, 0.0),
    vec2f(1.0, 1.0),
  );

  let localPos = quadVertices[vertexIndex];

  let u = (f32(cellX) + localPos.x) / f32(gridSize);
  let v = (f32(cellY) + localPos.y) / f32(gridSize);
  output.uv = vec2f(u, v);

  // Paper dimensions (width x height in 3D space)
  let paperW = 1.0;
  let paperH = 1.4;

  // Map UV to 3D position (paper lies in XY plane, Z=0)
  let x = (u - 0.5) * paperW;
  let y = (v - 0.5) * paperH;
  var z = 0.0;

  var pos = vec3f(x, y, z);
  var normal = vec3f(0.0, 0.0, 1.0);

  let PI = 3.14159265;
  let t = uniforms.foldProgress;

  // Smooth easing
  let easedT = t * t * (3.0 - 2.0 * t);

  // Fold right half over to left
  if (x > 0.0) {
    let angle = easedT * PI;
    let cosA = cos(angle);
    let sinA = sin(angle);

    // Rotate around Y axis at x=0
    pos.x = x * cosA;
    pos.z = x * sinA;

    // Normal rotates too
    normal = vec3f(sinA, 0.0, cosA);
  }

  output.worldPos = pos;
  output.normal = normal;

  // Apply isometric projection
  let projected = isometricProject(pos);

  // Scale to fit screen
  let scale = 1.3;

  output.position = vec4f(
    projected.x * scale / uniforms.aspectRatio,
    projected.y * scale,
    pos.z * 0.1 + 0.5, // depth for z-buffer
    1.0
  );

  return output;
}
`;

const fragmentShader = /* wgsl */ `
struct Uniforms {
  aspectRatio: f32,
  foldProgress: f32,
  padding1: f32,
  padding2: f32,
}

struct FragmentInput {
  @location(0) normal: vec3f,
  @location(1) uv: vec2f,
  @location(2) worldPos: vec3f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f {
  let normal = normalize(input.normal);

  // Isometric flat shading - 3 tones based on face orientation
  // Light comes from top-left in isometric view
  let lightDir = normalize(vec3f(-0.5, 1.0, 0.8));

  // Calculate which "face" this is based on normal
  let dotTop = max(dot(normal, vec3f(0.0, 0.0, 1.0)), 0.0);
  let dotLeft = max(dot(normal, vec3f(-1.0, 0.0, 0.0)), 0.0);
  let dotRight = max(dot(normal, vec3f(1.0, 0.0, 0.0)), 0.0);
  let dotBack = max(dot(normal, vec3f(0.0, 0.0, -1.0)), 0.0);

  // Base paper color (clean white)
  let paperLight = vec3f(0.98, 0.98, 1.0);   // Top face - lightest
  let paperMid = vec3f(0.88, 0.88, 0.92);    // Left face - medium
  let paperDark = vec3f(0.78, 0.78, 0.84);   // Right face - darkest
  let paperBack = vec3f(0.85, 0.85, 0.90);   // Back face

  // Mix colors based on normal direction (flat shading)
  var color = paperLight * dotTop
            + paperMid * dotLeft
            + paperDark * dotRight
            + paperBack * dotBack;

  // For faces pointing forward (z+), use light color
  if (abs(normal.z) > 0.9 && normal.z > 0.0) {
    color = paperLight;
  }
  // For faces pointing backward (z-), use back color
  if (abs(normal.z) > 0.9 && normal.z < 0.0) {
    color = paperBack;
  }

  // Subtle fold crease line
  let creaseDist = abs(input.uv.x - 0.5);
  let crease = smoothstep(0.0, 0.012, creaseDist);
  color *= 0.92 + crease * 0.08;

  // Clean edge line (subtle)
  let edgeX = min(input.uv.x, 1.0 - input.uv.x);
  let edgeY = min(input.uv.y, 1.0 - input.uv.y);
  let edge = smoothstep(0.0, 0.008, min(edgeX, edgeY));

  // Edge gets slightly darker
  color = mix(color * 0.7, color, edge);

  return vec4f(color, 1.0);
}
`;

const StepButton = ({
  index,
  label,
  currentStep,
  onPress,
}: {
  index: number;
  label: string;
  currentStep: Animated.SharedValue<number>;
  onPress: () => void;
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    const isActive = Math.round(currentStep.value) === index;
    return {
      backgroundColor: withTiming(
        isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.1)',
        { duration: 250, easing: Easing.out(Easing.cubic) },
      ),
      transform: [
        { scale: withTiming(isActive ? 1 : 0.92, { duration: 200 }) },
      ],
    };
  });

  const textStyle = useAnimatedStyle(() => {
    const isActive = Math.round(currentStep.value) === index;
    return {
      color: withTiming(isActive ? '#1a1a1a' : 'rgba(255,255,255,0.9)', {
        duration: 200,
      }),
    };
  });

  return (
    <Pressable onPress={onPress} style={styles.stepPressable}>
      <Animated.View style={[styles.stepButton, animatedStyle]}>
        <Animated.Text style={[styles.stepNumber, textStyle]}>
          {index + 1}
        </Animated.Text>
      </Animated.View>
      <Text style={styles.stepLabel}>{label}</Text>
    </Pressable>
  );
};

export const FoldingPaper = () => {
  const { width, height } = useWindowDimensions();
  const canvasRef = useRef<CanvasRef>(null);
  const animationRef = useRef<number | null>(null);
  const scrollViewRef = useRef<Animated.ScrollView>(null);

  const scrollX = useSharedValue(0);
  const currentStep = useDerivedValue(() => scrollX.value / width);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: e => {
      scrollX.value = e.contentOffset.x;
    },
  });

  const scrollToStep = useCallback(
    (step: number) => {
      scrollViewRef.current?.scrollTo({ x: step * width, animated: true });
    },
    [width],
  );

  const initWebGPU = useCallback(async () => {
    if (!canvasRef.current) return;

    const context = canvasRef.current.getContext('webgpu');
    if (!context) return;

    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) return;

    const device = await adapter.requestDevice();
    const format = navigator.gpu.getPreferredCanvasFormat();

    const canvas = context.canvas as HTMLCanvasElement;
    canvas.width = canvas.clientWidth * PixelRatio.get();
    canvas.height = canvas.clientHeight * PixelRatio.get();

    context.configure({ device, format, alphaMode: 'opaque' });

    const uniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
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

    const depthTexture = device.createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const aspectRatio = width / height;
    const numCells = GRID_SIZE * GRID_SIZE;

    const render = () => {
      const foldProgress = Math.min(Math.max(scrollX.value / width, 0), 1);

      const uniformData = new Float32Array([aspectRatio, foldProgress, 0, 0]);
      device.queue.writeBuffer(uniformBuffer, 0, uniformData);

      const commandEncoder = device.createCommandEncoder();
      const textureView = context.getCurrentTexture().createView();

      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: textureView,
            clearValue: { r: 0.11, g: 0.11, b: 0.14, a: 1 },
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

      renderPass.setPipeline(pipeline);
      renderPass.setBindGroup(0, bindGroup);
      renderPass.draw(6, numCells);
      renderPass.end();

      device.queue.submit([commandEncoder.finish()]);
      context.present();

      animationRef.current = requestAnimationFrame(render);
    };

    render();
  }, [height, width, scrollX]);

  useEffect(() => {
    const id = setTimeout(initWebGPU, 100);
    return () => {
      clearTimeout(id);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [initWebGPU]);

  return (
    <View style={styles.container}>
      <Canvas ref={canvasRef} style={styles.canvas} />

      <Animated.ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        decelerationRate="fast"
        snapToInterval={width}
        style={StyleSheet.absoluteFill}
        contentContainerStyle={{ width: width * NUM_STEPS }}
      />

      <View style={styles.stepsContainer}>
        {STEP_LABELS.map((label, i) => (
          <StepButton
            key={i}
            index={i}
            label={label}
            currentStep={currentStep}
            onPress={() => scrollToStep(i)}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  canvas: { flex: 1 },
  container: { backgroundColor: '#1c1c22', flex: 1 },
  stepButton: {
    alignItems: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  stepLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 8,
  },
  stepNumber: {
    fontSize: 18,
    fontWeight: '600',
  },
  stepPressable: { alignItems: 'center' },
  stepsContainer: {
    bottom: 60,
    flexDirection: 'row',
    gap: 32,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
});
