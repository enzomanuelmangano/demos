#!/usr/bin/env bun
// The GitHub card's squircle as CSS (web/content.css): prints the rules; paste them over the old ones, then run
// bun tools/head.ts. figma-squircle 1.x maths (the reference: components/squircle, radius 14, smoothing 0.6).
// figma-squircle 1.x getPathParamsForCorner (no clamping: the budget, min(w,h)/2, exceeds p for every card).
const R = 14, S = 0.6;
const rad = (d: number) => (d * Math.PI) / 180;
const p = (1 + S) * R;
const arcMeasure = 90 * (1 - S);
const arc = Math.sin(rad(arcMeasure / 2)) * R * Math.sqrt(2);
const alpha = (90 - arcMeasure) / 2;
const p34 = R * Math.tan(rad(alpha / 2));
const beta = 45 * S;
const c = p34 * Math.cos(rad(beta));
const d = c * Math.tan(rad(beta));
const b = (p - arc - c - d) / 3, a = 2 * b;
const f = (n: number) => +n.toFixed(4);
// The top-left corner, from (0, T) up the left edge, round to (T, 0) along the top edge (figma's drawTopLeftPath).
const curve = (ox: number, oy: number, T: number) =>
  `M${f(ox)} ${f(oy + T)}L${f(ox)} ${f(oy + p)}c0 ${f(-a)} 0 ${f(-(a + b))} ${f(d)} ${f(-(a + b + c))}a${R} ${R} 0 0 1 ${f(arc)} ${f(-arc)}c${f(c)} ${f(-d)} ${f(b + c)} ${f(-d)} ${f(a + b + c)} ${f(-d)}L${f(ox + T)} ${f(oy)}`;
const rot = { tl: '', tr: 'scale(-1 1) translate(-T 0)', bl: 'scale(1 -1) translate(0 -T)', br: 'scale(-1 -1) translate(-T -T)' } as const;
const svg = (T: number, body: string, k: keyof typeof rot) =>
  `<svg xmlns='http://www.w3.org/2000/svg' width='${T}' height='${T}'><g transform='${rot[k].replace(/T/g, String(T))}'>${body}</g></svg>`;
const uri = (s: string) => `url("data:image/svg+xml,${s.replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'")}")`;
const T = 24;
const fill = (k: keyof typeof rot) => uri(svg(T, `<path d='${curve(0, 0, T)}L${T} ${T}Z'/>`, k));
// The rim tile: 25 px, the card's corner at (1, 1): the 1 px stroke centred on the edge, as live's SVG stroke.
const RT = 25;
const rimColor = { tl: 'rgba(255,255,255,0.065)', tr: 'rgba(255,255,255,0.065)', bl: 'rgba(255,255,255,0.04)', br: 'rgba(255,255,255,0.04)' };
const rim = (k: keyof typeof rot) => uri(svg(RT, `<path d='${curve(1, 1, RT - 1)}' fill='none' stroke='${rimColor[k]}'/>`, k));
// An edge: a 1 px line centred on the card's edge in a 2 px strip, stretched along the edge (the stroke keeps its
// width); a side's colour falls from live's 6.3 % (24 px down its 8 % -> 5 % -> 4 % gradient) to 4.4 %.
const edge = (dir: 'h' | 'v', color = '') => uri(dir === 'h'
  ? `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 2' preserveAspectRatio='none'><path d='M0 1H1' stroke='${color}' vector-effect='non-scaling-stroke'/></svg>`
  : `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 1' preserveAspectRatio='none'><linearGradient id='g' gradientUnits='userSpaceOnUse' x1='0' y1='0' x2='0' y2='1'><stop stop-color='%23fff' stop-opacity='0.063'/><stop offset='1' stop-color='%23fff' stop-opacity='0.044'/></linearGradient><path d='M1 0V1' stroke='url(%23g)' vector-effect='non-scaling-stroke'/></svg>`);
const css = [
  `/* The GitHub card's squircle (live: components/squircle Surface, figma-squircle radius 14, smoothing 0.6): the`,
  `   corners are the same at any size, so the fill is masked by four 24 px corner tiles and two bars, and the rim is`,
  `   four 25 px corner strokes and four edges; the drop shadows follow the masked shape (tools/squircle-css.ts). */`,
  `[data-motion~=squircle-shadow]{filter:drop-shadow(0 1px 2px rgb(0 0 0/.14)) drop-shadow(0 6px 16px rgb(0 0 0/.1))}`,
  `[data-motion~=squircle]{--sq:${fill('tl')} top left/24px 24px no-repeat,${fill('tr')} top right/24px 24px no-repeat,${fill('bl')} bottom left/24px 24px no-repeat,${fill('br')} bottom right/24px 24px no-repeat,linear-gradient(#000,#000) center/calc(100% - 48px) 100% no-repeat,linear-gradient(#000,#000) center/100% calc(100% - 48px) no-repeat;-webkit-mask:var(--sq);mask:var(--sq)}`,
  `[data-motion~=squircle-rim]{background:${rim('tl')} top left/25px 25px no-repeat,${rim('tr')} top right/25px 25px no-repeat,${rim('bl')} bottom left/25px 25px no-repeat,${rim('br')} bottom right/25px 25px no-repeat,${edge('h', 'rgba(255,255,255,0.08)')} 25px 0/calc(100% - 50px) 2px no-repeat,${edge('h', 'rgba(255,255,255,0.04)')} 25px 100%/calc(100% - 50px) 2px no-repeat,${edge('v')} 0 25px/2px calc(100% - 50px) no-repeat,${edge('v')} 100% 25px/2px calc(100% - 50px) no-repeat}`,
];
console.log(css.join('\n'));
