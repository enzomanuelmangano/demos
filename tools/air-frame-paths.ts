#!/usr/bin/env bun
// The iPhone Air frame's rim and black glass outlines for the web's desktop frame (home/web-phone.contract): the display's
// continuous 62 pt outline (airDisplayPath) offset outward along its normals, so the bezel and the rim are the same
// thickness everywhere, corners included (a polygon: 13 points per cubic, under 0.02 pt from the true offset).
//   bun tools/air-frame-paths.ts <offset> <translate>   (rim 12 12, rim highlight 11 12, glass 8 8, glass highlight 7 8)
const P = "M94.78 0L325.22 0C352.51 0 366.16 0 380.85 4.64C396.88 10.48 409.52 23.12 415.36 39.15C420 53.84 420 67.49 420 94.78L420 817.22C420 844.51 420 858.16 415.36 872.85C409.52 888.88 396.88 901.52 380.85 907.36C366.16 912 352.51 912 325.22 912L94.78 912C67.49 912 53.84 912 39.15 907.36C23.12 901.52 10.48 888.88 4.64 872.85C0 858.16 0 844.51 0 817.22L0 94.78C0 67.49 0 53.84 4.64 39.15C10.48 23.12 23.12 10.48 39.15 4.64C53.84 0 67.49 0 94.78 0Z";
export function offsetPath(d: number, t: number, n = 12) {
  const toks = P.match(/[MLCZ]|-?[\d.]+/g)!;
  const pts: [number, number, number, number][] = []; // x, y, nx, ny
  let i = 0, cur: [number, number] = [0, 0];
  const num = () => Number(toks[i++]);
  while (i < toks.length) {
    const c = toks[i++];
    if (c === 'M') cur = [num(), num()];
    else if (c === 'L') { const p: [number, number] = [num(), num()]; const dx = p[0] - cur[0], dy = p[1] - cur[1], l = Math.hypot(dx, dy); pts.push([cur[0], cur[1], dy / l, -dx / l], [p[0], p[1], dy / l, -dx / l]); cur = p; }
    else if (c === 'C') {
      const a = cur, b: [number, number] = [num(), num()], cc: [number, number] = [num(), num()], e: [number, number] = [num(), num()];
      for (let k = 0; k <= n; k++) {
        const s = k / n, u = 1 - s;
        const x = u*u*u*a[0] + 3*u*u*s*b[0] + 3*u*s*s*cc[0] + s*s*s*e[0], y = u*u*u*a[1] + 3*u*u*s*b[1] + 3*u*s*s*cc[1] + s*s*s*e[1];
        let dx = 3*u*u*(b[0]-a[0]) + 6*u*s*(cc[0]-b[0]) + 3*s*s*(e[0]-cc[0]), dy = 3*u*u*(b[1]-a[1]) + 6*u*s*(cc[1]-b[1]) + 3*s*s*(e[1]-cc[1]);
        if (Math.hypot(dx, dy) < 1e-9) { dx = e[0] - a[0]; dy = e[1] - a[1]; }
        const l = Math.hypot(dx, dy); pts.push([x, y, dy / l, -dx / l]);
      }
      cur = e;
    } else if (c === 'Z') break;
  }
  // The path runs clockwise in screen coordinates (y down): (dy, -dx) points outward.
  const f = (v: number) => (Math.round(v * 100) / 100).toString();
  const out: string[] = []; let last = '';
  for (const [x, y, nx, ny] of pts) { const s = `${f(x + nx * d + t)} ${f(y + ny * d + t)}`; if (s !== last) out.push(s); last = s; }
  return 'M' + out[0] + 'L' + out.slice(1).join('L') + 'Z';
}
if (import.meta.main) { const [d, t] = process.argv.slice(2).map(Number); console.log(offsetPath(d, t)); }
