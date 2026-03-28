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
  Easing,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Canvas, CanvasRef } from 'react-native-wgpu';

const GRID_SIZE = 80;
const STEP_LABELS = ['Flat', 'Crease', 'Corners', 'Edges', 'Fold', 'Wings'];
const NUM_STEPS = STEP_LABELS.length;

const vertexShader = /* wgsl */ `
struct Uniforms {
  aspectRatio: f32,
  stepProgress: f32,
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

fn isometricProject(p: vec3f) -> vec2f {
  let isoAngle = 0.615479709;
  let cosY = 0.7071067812;
  let sinY = 0.7071067812;
  let rx = p.x * cosY - p.z * sinY;
  let rz = p.x * sinY + p.z * cosY;
  let cosX = cos(isoAngle);
  let sinX = sin(isoAngle);
  let ry = p.y * cosX - rz * sinX;
  return vec2f(rx, ry);
}

fn ease(t: f32) -> f32 {
  return t * t * (3.0 - 2.0 * t);
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

  let paperW = 1.0;
  let paperH = 1.4;
  let halfW = paperW * 0.5;
  let halfH = paperH * 0.5;

  // Original position - used for region detection
  let origX = (u - 0.5) * paperW;
  let origY = (v - 0.5) * paperH;

  // Current position - modified by folds
  var pos = vec3f(origX, origY, 0.0);
  var normal = vec3f(0.0, 0.0, 1.0);

  let PI = 3.14159265;
  let progress = uniforms.stepProgress;

  // Top of paper
  let topY = halfH;

  // ============================================
  // STEP 1 (progress 0->1): Center crease
  // Fold right half over then back to create crease
  // ============================================
  let t1raw = clamp(progress, 0.0, 1.0);
  var foldAngle1: f32 = 0.0;
  if (t1raw < 0.5) {
    foldAngle1 = ease(t1raw * 2.0) * PI;
  } else {
    foldAngle1 = (1.0 - ease((t1raw - 0.5) * 2.0)) * PI;
  }

  // Right half folds around x=0
  if (origX > 0.0) {
    let cosA = cos(foldAngle1);
    let sinA = sin(foldAngle1);
    pos.x = origX * cosA;
    pos.z = origX * sinA;
    normal = vec3f(sinA, 0.0, cosA);
  }

  // ============================================
  // STEP 2 (progress 1->2): Corner folds
  // Top corners fold down to center line
  // ============================================
  let t2 = ease(clamp(progress - 1.0, 0.0, 1.0));

  // Left corner triangle: above diagonal y = topY + x (for x < 0)
  let inLeftCorner = origX < 0.0 && origY > (topY + origX);

  // Right corner triangle: above diagonal y = topY - x (for x > 0)
  let inRightCorner = origX > 0.0 && origY > (topY - origX);

  if (t2 > 0.0 && inLeftCorner) {
    let foldAngle = t2 * PI;

    // Fold line: from (0, topY) direction (-1, -1) normalized
    let lineDir = vec2f(-0.7071067812, -0.7071067812);
    let lineOrigin = vec2f(0.0, topY);

    // Current 2D position
    let p2d = vec2f(pos.x, pos.y);

    // Vector from line origin to point
    let toPoint = p2d - lineOrigin;

    // Component along fold line
    let alongLine = dot(toPoint, lineDir);

    // Perpendicular component (distance from line, signed)
    let perpDir = vec2f(lineDir.y, -lineDir.x); // (−1,−1) rotated 90° = (−1, 1) normalized = (-0.707, 0.707)
    let perpDist = dot(toPoint, perpDir);

    // Point on fold line
    let foldPoint = lineOrigin + lineDir * alongLine;

    // Rotate perpendicular component around fold line
    let cosA = cos(foldAngle);
    let sinA = sin(foldAngle);

    // New position: fold point + rotated perpendicular
    pos.x = foldPoint.x + perpDir.x * perpDist * cosA;
    pos.y = foldPoint.y + perpDir.y * perpDist * cosA;
    pos.z = perpDist * sinA + t2 * 0.008;

    // Rotate normal
    normal = vec3f(perpDir.x * sinA, perpDir.y * sinA, cosA);
  }

  if (t2 > 0.0 && inRightCorner) {
    let foldAngle = t2 * PI;

    // Fold line: from (0, topY) direction (1, -1) normalized
    let lineDir = vec2f(0.7071067812, -0.7071067812);
    let lineOrigin = vec2f(0.0, topY);

    let p2d = vec2f(pos.x, pos.y);
    let toPoint = p2d - lineOrigin;
    let alongLine = dot(toPoint, lineDir);
    let perpDir = vec2f(lineDir.y, -lineDir.x); // (1,-1) rotated 90° CW = (-1,-1) norm = (-0.707, -0.707)
    let perpDist = dot(toPoint, perpDir);
    let foldPoint = lineOrigin + lineDir * alongLine;

    let cosA = cos(foldAngle);
    let sinA = sin(foldAngle);

    pos.x = foldPoint.x + perpDir.x * perpDist * cosA;
    pos.y = foldPoint.y + perpDir.y * perpDist * cosA;
    pos.z = -perpDist * sinA + t2 * 0.008;

    normal = vec3f(-perpDir.x * sinA, -perpDir.y * sinA, cosA);
  }

  // ============================================
  // STEP 3 (progress 2->3): Edge folds
  // Fold the angled edges to center again
  // ============================================
  let t3 = ease(clamp(progress - 2.0, 0.0, 1.0));

  // After corner folds, we have new edges from nose going down
  // These edges are at roughly x = ±0.15 in the upper region
  // Fold the outer strips to the center

  let edgeEndY = topY - halfW; // Where corner fold ends (y = topY - halfW)

  // Left edge strip: origX in range [-0.35, -0.1] and y > edgeEndY
  let inLeftEdge = origX < -0.08 && origX > -0.35 && origY > edgeEndY && !inLeftCorner;

  // Right edge strip: origX in range [0.1, 0.35] and y > edgeEndY
  let inRightEdge = origX > 0.08 && origX < 0.35 && origY > edgeEndY && !inRightCorner;

  if (t3 > 0.0 && inLeftEdge) {
    let foldAngle = t3 * PI;
    let foldX = -0.08;

    let cosA = cos(foldAngle);
    let sinA = sin(foldAngle);

    let dx = pos.x - foldX;
    pos.x = foldX + dx * cosA;
    pos.z = pos.z + dx * sinA + t3 * 0.012;

    // Update normal (rotate around Y axis)
    normal = vec3f(
      normal.x * cosA + normal.z * sinA,
      normal.y,
      -normal.x * sinA + normal.z * cosA
    );
  }

  if (t3 > 0.0 && inRightEdge) {
    let foldAngle = t3 * PI;
    let foldX = 0.08;

    let cosA = cos(foldAngle);
    let sinA = sin(foldAngle);

    let dx = pos.x - foldX;
    pos.x = foldX + dx * cosA;
    pos.z = pos.z - dx * sinA + t3 * 0.012;

    normal = vec3f(
      normal.x * cosA - normal.z * sinA,
      normal.y,
      normal.x * sinA + normal.z * cosA
    );
  }

  // ============================================
  // STEP 4 (progress 3->4): Body fold
  // Fold entire plane in half along x=0
  // ============================================
  let t4 = ease(clamp(progress - 3.0, 0.0, 1.0));

  if (t4 > 0.0) {
    // Everything with origX > 0 folds over
    // But we need to fold the CURRENT position, not original
    // The fold axis is at x=0

    if (origX > 0.0) {
      let foldAngle = t4 * PI;
      let cosA = cos(foldAngle);
      let sinA = sin(foldAngle);

      // Rotate around Y axis at x=0
      let newX = pos.x * cosA;
      let newZ = pos.z + pos.x * sinA;

      pos.x = newX;
      pos.z = newZ + t4 * 0.02;

      // Rotate normal
      normal = vec3f(
        normal.x * cosA + normal.z * sinA,
        normal.y,
        -normal.x * sinA + normal.z * cosA
      );
    }
  }

  // ============================================
  // STEP 5 (progress 4->5): Wing unfold
  // Open wings to flying position
  // ============================================
  let t5 = ease(clamp(progress - 4.0, 0.0, 1.0));

  if (t5 > 0.0) {
    // Wings are the upper portion (nose area)
    let wingStartY = topY - halfW * 1.2;

    if (origY > wingStartY) {
      // After body fold, both sides are now overlapping at x <= 0
      // We need to unfold them outward

      let wingAngle = t5 * PI * 0.4; // About 72 degrees

      // Left wing (original left side) - rotate one way
      // Right wing (original right side, now folded over) - rotate other way

      if (origX <= 0.0) {
        // Original left side - unfold to the left
        let cosA = cos(-wingAngle);
        let sinA = sin(-wingAngle);

        let newX = pos.x * cosA - pos.z * sinA;
        let newZ = pos.x * sinA + pos.z * cosA;
        pos.x = newX;
        pos.z = newZ;

        normal = vec3f(
          normal.x * cosA - normal.z * sinA,
          normal.y,
          normal.x * sinA + normal.z * cosA
        );
      } else {
        // Original right side (was folded over) - unfold to the right
        let cosA = cos(wingAngle);
        let sinA = sin(wingAngle);

        let newX = pos.x * cosA - pos.z * sinA;
        let newZ = pos.x * sinA + pos.z * cosA;
        pos.x = newX;
        pos.z = newZ;

        normal = vec3f(
          normal.x * cosA - normal.z * sinA,
          normal.y,
          normal.x * sinA + normal.z * cosA
        );
      }
    }
  }

  output.worldPos = pos;
  output.normal = normal;

  let projected = isometricProject(pos);
  let scale = 1.2;

  output.position = vec4f(
    projected.x * scale / uniforms.aspectRatio,
    projected.y * scale,
    pos.z * 0.1 + 0.5,
    1.0
  );

  return output;
}
`;

const fragmentShader = /* wgsl */ `
struct Uniforms {
  aspectRatio: f32,
  stepProgress: f32,
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

  // Front/back coloring
  let isFront = normal.z > 0.0;
  let paperFront = vec3f(0.98, 0.98, 1.0);
  let paperBack = vec3f(0.85, 0.85, 0.90);

  var color = select(paperBack, paperFront, isFront);

  // Simple shading
  let lightDir = normalize(vec3f(-0.3, 0.8, 0.5));
  let shade = 0.6 + 0.4 * max(dot(abs(normal), lightDir), 0.0);
  color *= shade;

  // Center crease
  let creaseDist = abs(input.uv.x - 0.5);
  let crease = smoothstep(0.0, 0.01, creaseDist);
  color *= 0.9 + crease * 0.1;

  // Edge darkening
  let edgeX = min(input.uv.x, 1.0 - input.uv.x);
  let edgeY = min(input.uv.y, 1.0 - input.uv.y);
  let edge = smoothstep(0.0, 0.008, min(edgeX, edgeY));
  color = mix(color * 0.5, color, edge);

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

export const PaperAirplane = () => {
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
      const stepProgress = Math.min(
        Math.max(scrollX.value / width, 0),
        NUM_STEPS - 1,
      );

      const uniformData = new Float32Array([aspectRatio, stepProgress, 0, 0]);
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
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  stepLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    fontWeight: '500',
    marginTop: 6,
  },
  stepNumber: {
    fontSize: 16,
    fontWeight: '600',
  },
  stepPressable: { alignItems: 'center' },
  stepsContainer: {
    bottom: 60,
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
});
