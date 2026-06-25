import { Skia } from '@shopify/react-native-skia';

// Page-curl runtime shader, ported from W. Candillon's "Riveo"
// (can-it-be-done-in-react-native, season 5). Warps the layer's content
// (`image`) into a curling page peeling from the right edge. Where the page
// has curled away the shader returns TRANSPARENT, revealing whatever is drawn
// underneath (the next page).
//
// Uniforms (all in PIXELS):
//   image       - the layer content being curled
//   pointer     - current drag x
//   origin      - drag start x
//   container   - page rect [x, y, x2, y2]
//   cornerRadius- rounded-corner radius for the page rect
//   resolution  - canvas size
const source = Skia.RuntimeEffect.Make(`
uniform shader image;
uniform float pointer;
uniform float origin;
uniform vec4 container;
uniform float cornerRadius;
uniform vec2 resolution;

const float r = 150.0;
const float PI = 3.1415926535897932;
const vec4 TRANSPARENT = vec4(0.0);

mat3 translate(vec2 p) {
  return mat3(1.0, 0.0, 0.0, 0.0, 1.0, 0.0, p.x, p.y, 1.0);
}
mat3 scaleM(vec2 s, vec2 p) {
  return translate(p) * mat3(s.x, 0.0, 0.0, 0.0, s.y, 0.0, 0.0, 0.0, 1.0) * translate(-p);
}
vec2 project(vec2 p, mat3 m) {
  return (inverse(m) * vec3(p, 1.0)).xy;
}

bool inRect(float2 p, float4 rct) {
  bool inRct = p.x > rct.x && p.x < rct.z && p.y > rct.y && p.y < rct.w;
  if (!inRct) { return false; }
  if (p.x < rct.x + cornerRadius && p.y < rct.y + cornerRadius) {
    return length(p - float2(rct.x + cornerRadius, rct.y + cornerRadius)) < cornerRadius;
  }
  if (p.x > rct.z - cornerRadius && p.y < rct.y + cornerRadius) {
    return length(p - float2(rct.z - cornerRadius, rct.y + cornerRadius)) < cornerRadius;
  }
  if (p.x < rct.x + cornerRadius && p.y > rct.w - cornerRadius) {
    return length(p - float2(rct.x + cornerRadius, rct.w - cornerRadius)) < cornerRadius;
  }
  if (p.x > rct.z - cornerRadius && p.y > rct.w - cornerRadius) {
    return length(p - float2(rct.z - cornerRadius, rct.w - cornerRadius)) < cornerRadius;
  }
  return true;
}

half4 main(float2 xy) {
  half4 color = image.eval(xy);
  float2 center = resolution * 0.5;
  float dx = origin - pointer;
  float x = container.z - dx;
  float d = xy.x - x;

  if (d > r) {
    color = TRANSPARENT;
    if (inRect(xy, container)) {
      color.a = mix(0.5, 0.0, (d - r) / r);
    }
  } else if (d > 0.0) {
    float theta = asin(d / r);
    float d1 = theta * r;
    float d2 = (PI - theta) * r;

    vec2 s = vec2(1.0 + (1.0 - sin(PI / 2.0 + theta)) * 0.1);
    mat3 transform = scaleM(s, center);
    vec2 uv = project(xy, transform);
    vec2 p1 = vec2(x + d1, uv.y);

    s = vec2(1.1 + sin(PI / 2.0 + theta) * 0.1);
    transform = scaleM(s, center);
    uv = project(xy, transform);
    vec2 p2 = vec2(x + d2, uv.y);

    if (inRect(p2, container)) {
      color = image.eval(p2);
    } else if (inRect(p1, container)) {
      color = image.eval(p1);
      color.rgb *= pow(clamp((r - d) / r, 0.0, 1.0), 0.2);
    } else if (inRect(xy, container)) {
      color = TRANSPARENT;
      color.a = 0.5;
    }
  } else {
    vec2 s = vec2(1.2);
    mat3 transform = scaleM(s, center);
    vec2 uv = project(xy, transform);
    vec2 p = vec2(x + abs(d) + PI * r, uv.y);
    if (inRect(p, container)) {
      color = image.eval(p);
    } else {
      color = image.eval(xy);
    }
  }
  return color;
}
`);

if (!source) {
  throw new Error('Failed to compile page-curl shader');
}

export const pageCurl = source;
