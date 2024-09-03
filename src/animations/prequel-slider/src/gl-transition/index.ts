import type { Transition } from '../components/image-editor/utils';
import { glsl } from '../components/image-editor/utils';

// I started from the ButterflyWaveScrawler transition from gl-transitions.com
// https://gl-transitions.com/editor/ButterflyWaveScrawler
// And I forced the progress to be at max 0.35
// Then I just played a bit with the
// - Amplitude
// - ColorSeparation
// - Waves
// You can treat them as parameters and handle them in the UI with different sliders

export const ButterflyWaveScrawlerGL: Transition = glsl`
// Author: mandubian
// License: MIT
float amplitude = 1.5;
float waves = 10.0;
float colorSeparation = 3.0;
float PI = 3.14159265358979323846264;

float compute(vec2 p, float progress, vec2 center) {
vec2 o = p*sin(progress * amplitude)-center;
// horizontal vector
vec2 h = vec2(1., 0.);
// butterfly polar function (don't ask me why this one :))
float theta = acos(dot(o, h)) * waves;
return (exp(cos(theta)) - 2.*cos(4.*theta) + pow(sin((2.*theta - PI) / 24.), 5.)) / 10.;
}

vec4 transition(vec2 uv) {
  vec2 p = uv.xy / vec2(1.0).xy;
  float realProgress = progress * .5;
  float inv = 1. - realProgress;
  vec2 dir = p - vec2(.5);
  float dist = length(dir);
  float disp = compute(p, realProgress, vec2(0.5, 0.5)) ;
  vec4 texTo = getToColor(p + inv*disp);
  vec4 texFrom = vec4(
  getFromColor(p + realProgress*disp*(1.0 - colorSeparation)).r,
  getFromColor(p + realProgress*disp).g,
  getFromColor(p + realProgress*disp*(1.0 + colorSeparation)).b,
  1.0);
  return texTo*realProgress + texFrom*inv;
}

`;
