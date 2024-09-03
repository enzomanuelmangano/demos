import { Skia } from '@shopify/react-native-skia';

type Value = string | number;
type Values = Value[];

// A util that I took from William's example: https://youtu.be/PzKWpwmmRqM
// You can find it in the RN Skia examples repo: https://github.com/Shopify/react-native-skia/blob/main/example/src/components/ShaderLib/Tags.tsx
export const glsl = (source: TemplateStringsArray, ...values: Values) => {
  const processed = source.flatMap((s, i) => [s, values[i]]).filter(Boolean);
  return processed.join('');
};

export const frag = (source: TemplateStringsArray, ...values: Values) => {
  const code = glsl(source, ...values);
  const rt = Skia.RuntimeEffect.Make(code);
  if (rt === null) {
    throw new Error("Couln't Compile Shader");
  }
  return rt;
};
