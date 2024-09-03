import type { Transition } from '../providers/gl-transitions';
import { glsl } from '../providers/gl-transitions';

// https://gl-transitions.com/editor/directionalwarp
export const DirectionalWarp: Transition = glsl`
const vec2 direction = vec2(0.0, 1.0); // Direction of the water drop
const float smoothness = 0.50; // Increased smoothness for a smoother transition
const vec2 center = vec2(0.5, 0.5);

vec4 transition (vec2 uv) {
    vec2 v = normalize(direction);
    v /= abs(v.x) + abs(v.y);
    float d = v.x * center.x + sin(v.y * center.y);
    float m = 1.0 - smoothstep(-smoothness, 0.0, v.x * uv.x + v.y * uv.y - (d - 0.5 + progress * (1.0 + smoothness)));

    // Calculate the distance from the center for visualization
    float circle = sqrt(pow(uv.x - center.x, 2.0) + pow(uv.y - center.y, 2.0));

    // Output the radius as a color gradient
    vec3 radiusColor = vec3(circle, circle, circle);

    // Adjust the expansion direction to be from top to bottom
    m *= smoothstep(0.0, 0.5, 1.5 - circle);

    return mix(vec4(radiusColor, 1.0), mix(getFromColor((uv - 0.5) * (1.0 - m) + 0.5), getToColor((uv - 0.5) * m + 0.5), m), step(0.0, m));
}
`;
