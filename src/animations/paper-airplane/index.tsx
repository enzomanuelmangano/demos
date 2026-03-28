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

const GRID_SIZE = 100;
const STEP_LABELS = ['Flat', 'Corners', 'Airplane'];
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

  let origX = (u - 0.5) * paperW;
  let origY = (v - 0.5) * paperH;

  var pos = vec3f(origX, origY, 0.0);
  var normal = vec3f(0.0, 0.0, 1.0);

  let PI = 3.14159265;
  let progress = uniforms.stepProgress;
  let topY = halfH;

  // ============================================
  // STEP 1 (progress 0->1): Corner folds
  // Fold top corners down to center line
  // ============================================
  let t1 = ease(clamp(progress, 0.0, 1.0));

  // Left corner: origX < 0 and above diagonal y = topY + x
  let inLeftCorner = origX < 0.0 && origY > (topY + origX);

  // Right corner: origX > 0 and above diagonal y = topY - x
  let inRightCorner = origX > 0.0 && origY > (topY - origX);

  if (t1 > 0.0 && inLeftCorner) {
    let foldAngle = t1 * PI;

    // Fold line from (0, topY) with direction (-1, -1)
    let d = 0.7071067812;
    let lineDir = vec2f(-d, -d);
    let perpDir = vec2f(-d, d); // perpendicular pointing into the triangle
    let lineOrigin = vec2f(0.0, topY);

    let toPoint = vec2f(origX, origY) - lineOrigin;
    let alongLine = dot(toPoint, lineDir);
    let perpDist = dot(toPoint, perpDir);

    let foldPoint = lineOrigin + lineDir * alongLine;

    let cosA = cos(foldAngle);
    let sinA = sin(foldAngle);

    pos.x = foldPoint.x + perpDir.x * perpDist * cosA;
    pos.y = foldPoint.y + perpDir.y * perpDist * cosA;
    pos.z = abs(perpDist) * sinA + 0.001;

    normal = vec3f(perpDir.x * sinA, perpDir.y * sinA, cosA);
  }

  if (t1 > 0.0 && inRightCorner) {
    let foldAngle = t1 * PI;

    let d = 0.7071067812;
    let lineDir = vec2f(d, -d);
    let perpDir = vec2f(-d, -d); // perpendicular pointing into the triangle
    let lineOrigin = vec2f(0.0, topY);

    let toPoint = vec2f(origX, origY) - lineOrigin;
    let alongLine = dot(toPoint, lineDir);
    let perpDist = dot(toPoint, perpDir);

    let foldPoint = lineOrigin + lineDir * alongLine;

    let cosA = cos(foldAngle);
    let sinA = sin(foldAngle);

    pos.x = foldPoint.x + perpDir.x * perpDist * cosA;
    pos.y = foldPoint.y + perpDir.y * perpDist * cosA;
    pos.z = abs(perpDist) * sinA + 0.001;

    normal = vec3f(perpDir.x * sinA, perpDir.y * sinA, cosA);
  }

  // ============================================
  // STEP 2 (progress 1->2): Body fold + wing spread
  // Fold in half, then spread wings
  // ============================================
  let t2 = ease(clamp(progress - 1.0, 0.0, 1.0));

  if (t2 > 0.0) {
    // First: fold right half over (0 to 0.5 of t2)
    // Then: spread wings (0.5 to 1.0 of t2)

    let foldT = clamp(t2 * 2.0, 0.0, 1.0);
    let wingT = clamp(t2 * 2.0 - 1.0, 0.0, 1.0);

    // Body fold: right side folds over
    if (origX > 0.0) {
      let foldAngle = foldT * PI;
      let cosA = cos(foldAngle);
      let sinA = sin(foldAngle);

      let newX = pos.x * cosA;
      let newZ = pos.z + pos.x * sinA;

      pos.x = newX;
      pos.z = newZ + foldT * 0.01;

      normal = vec3f(
        normal.x * cosA + normal.z * sinA,
        normal.y,
        -normal.x * sinA + normal.z * cosA
      );
    }

    // Wing spread: upper portion opens up
    if (wingT > 0.0) {
      let wingRegionY = topY - halfW * 0.8;

      if (origY > wingRegionY) {
        let wingAngle = wingT * PI * 0.4;

        // After body fold, left wing stays left, right wing is now also at left
        // Spread them apart
        if (origX <= 0.0) {
          // Left wing - rotate outward (negative angle around Z-axis effect)
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
          // Right wing (was folded over) - rotate outward other way
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
  }

  output.worldPos = pos;
  output.normal = normal;

  let projected = isometricProject(pos);
  let scale = 1.2;

  output.position = vec4f(
    projected.x * scale / uniforms.aspectRatio,
    projected.y * scale,
    -pos.z * 0.1 + 0.5,
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

  let isFront = normal.z > 0.0;
  let paperFront = vec3f(0.98, 0.98, 1.0);
  let paperBack = vec3f(0.82, 0.82, 0.88);

  var color = select(paperBack, paperFront, isFront);

  // Shading
  let lightDir = normalize(vec3f(-0.3, 0.8, 0.6));
  let shade = 0.55 + 0.45 * max(dot(abs(normal), lightDir), 0.0);
  color *= shade;

  // Center crease
  let creaseDist = abs(input.uv.x - 0.5);
  let crease = smoothstep(0.0, 0.008, creaseDist);
  color *= 0.88 + crease * 0.12;

  // Diagonal creases for corners
  let u = input.uv.x;
  let v = input.uv.y;

  // Left diagonal
  let leftDiag = abs(v - 1.0 + u * 1.4);
  let leftCrease = smoothstep(0.0, 0.015, leftDiag);
  if (u < 0.5) {
    color *= 0.92 + leftCrease * 0.08;
  }

  // Right diagonal
  let rightDiag = abs(v - 1.0 + (1.0 - u) * 1.4);
  let rightCrease = smoothstep(0.0, 0.015, rightDiag);
  if (u > 0.5) {
    color *= 0.92 + rightCrease * 0.08;
  }

  // Edge
  let edgeX = min(input.uv.x, 1.0 - input.uv.x);
  let edgeY = min(input.uv.y, 1.0 - input.uv.y);
  let edge = smoothstep(0.0, 0.006, min(edgeX, edgeY));
  color = mix(color * 0.4, color, edge);

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
    gap: 24,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
});
