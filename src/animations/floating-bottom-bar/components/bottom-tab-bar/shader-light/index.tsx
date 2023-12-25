import {
  Canvas,
  Fill,
  Group,
  RoundedRect,
  Shader,
  Skia,
  useComputedValue,
  vec,
} from '@shopify/react-native-skia';

const source = Skia.RuntimeEffect.Make(`
uniform vec2 a;
uniform vec2 b;
uniform vec2 c;
uniform vec2 d;
uniform vec2 canvas;

// Returns the cross product of the two vectors (A,B) and (A,P)
float crossProduct(vec2 A, vec2 B, vec2 P) {
    return (B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x);
}

bool isBetween(vec2 A, vec2 B, vec2 C, vec2 D, vec2 P) {
  float cp1 = crossProduct(A, B, P);
  float cp2 = crossProduct(C, D, P);

  // Check if P is on the same side of AB as C and on the same side of CD as A
  return (cp1 > 0 && cp2 > 0) || (cp1 < 0 && cp2 < 0);
}

vec4 main(vec2 pos) {

  // normalized x,y values go from 0 to 1
  vec2 normalized = pos/canvas;

  float normalizedY = normalized.y;
  float maxNormalizedRGB = 0.7;

  // Check if pos is inside the area defined by a, b, c, and d
  bool inside = isBetween(c, a, b, d, pos);

  // If pos is inside the area, set color
  vec4 color =  vec4(
    maxNormalizedRGB - normalizedY,
    maxNormalizedRGB - normalizedY,
    maxNormalizedRGB - normalizedY, 
    0.0
  );

  if (inside) {
    return color; 
  }

  return vec4(0.0, 0.0, 0.0, 0.0);
}`)!;

type ShaderLightProps = {
  width: number;
  height: number;
};

const ShaderLight: React.FC<ShaderLightProps> = ({ width, height }) => {
  const shaderLightWidth = useComputedValue(() => {
    return width * 0.7;
  }, []);

  const x = useComputedValue(() => {
    return (width - shaderLightWidth.current) / 2;
  }, []);

  const canvasWidth = useComputedValue(() => {
    return width;
  }, []);

  const canvasHeight = useComputedValue(() => {
    return height;
  }, []);

  const uniforms = useComputedValue(() => {
    const internalPadding = 4;
    return {
      a: vec(x.current + internalPadding, 0),
      b: vec(x.current + shaderLightWidth.current - internalPadding, 0),
      c: vec(0, canvasHeight.current),
      d: vec(canvasWidth.current, canvasHeight.current),
      canvas: vec(canvasWidth.current, canvasHeight.current),
    };
  }, [x, shaderLightWidth, canvasHeight, canvasWidth]);

  return (
    <Canvas
      style={{
        width: width,
        height: height,
      }}>
      <Group>
        <Fill>
          <Shader source={source} uniforms={uniforms} />
        </Fill>
        <RoundedRect
          x={x}
          y={0}
          width={shaderLightWidth}
          height={6}
          color={'white'}
          r={5}
        />
      </Group>
    </Canvas>
  );
};

export { ShaderLight };
