import { frag } from './shader-lib';

export type Transition = string;

// A util that I took from William's example: https://youtu.be/PzKWpwmmRqM
// You can find it in the RN Skia examples repo: https://raw.githubusercontent.com/Shopify/react-native-skia/main/example/src/Examples/Transitions/transitions/Base.ts
export const transition = (t: Transition) => {
  return frag`
  uniform shader image1;
  uniform shader image2;

  uniform float progress;
  uniform float2 resolution;
  
  half4 getFromColor(float2 uv) {
    return image1.eval(uv * resolution);
  }
  
  half4 getToColor(float2 uv) {
    return image2.eval(uv * resolution);
  }
  
  ${t}

  half4 main(vec2 xy) {
    vec2 uv = xy / resolution;
    return transition(uv);
  }
  `;
};
