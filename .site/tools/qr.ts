#!/usr/bin/env bun
// Writes components/qr.contract: the reference's StyledQRCode (components/styled-qrcode) for each link below,
// computed once here (qrcode-generator; TestFlight's at level H, as the reference) so the page ships an SVG and no QR code library.
// Its modules are soft squares 0.8 of a cell with 0.26 corners; the three finders are rounded rings.
//   bun tools/qr.ts            (re-run when the link changes; --check for CI)
import qrcode from 'qrcode-generator';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Each QR code: its component's name, the link it opens and its error correction. The stores' codes are scanned off a
// screen, with nothing over them: level L keeps them coarse (29 and 33 modules; at H the Play link needs 49).
// TestFlight for /demos; the stores for /apps.
const CODES = [
  { name: 'TestFlightQr', value: 'https://testflight.apple.com/join/uB9PQHuT', what: 'The TestFlight QR code', level: 'H' },
  { name: 'PatternsAppStoreQr', value: 'https://apps.apple.com/app/id6809395535', what: "Patterns' App Store QR code", level: 'L', board: true },
  { name: 'PatternsPlayQr', value: 'https://play.google.com/store/apps/details?id=com.chesspatterns.app', what: "Patterns' Google Play QR code", level: 'L', board: true },
] as const;
const F = 7, S = 0.8, R = 0.26;
// Numbers to 4 decimals (the reference prints float noise such as 0.09999999999999998: same shape, a third the bytes).
const f = (v: number) => String(Math.round(v * 1e4) / 1e4);
// The module's outline after its start point is the same for every module: written once, compactly (SVG path
// grammar: no leading zero, a minus sign separates numbers).
const tail = `h.28a.26.26 0 0 1 .26.26v.28a.26.26 0 0 1-.26.26h-.28a.26.26 0 0 1-.26-.26v-.28a.26.26 0 0 1 .26-.26z`;
const mod = (x: number, y: number) => `M${f(x + (1 - S) / 2 + R)} ${f(y + (1 - S) / 2)}${tail}`;
if (S - 2 * R !== 0.28 || R !== 0.26) throw new Error('qr: tail is written for S 0.8, R 0.26');
// A board code (/apps) is drawn on an 8 x 8 chessboard: on hover the board shows, then resolves into the code a
// diagonal at a time from a1 to h8 (a diagonal is one colour, so the colours alternate), each square's modules
// fading in as its tint fades out (web/head.css qr-board). A finder belongs to the square its centre is in.
const component = ({ name, value, level, board }: { name: string; value: string; level: 'L' | 'M' | 'Q' | 'H'; board?: boolean }) => {
  const qr = qrcode(0, level);
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  const band = (v: number, s: number) => v >= s && v < s + F;
  const finder = (r: number, c: number) => (band(r, 0) && band(c, 0)) || (band(r, 0) && band(c, n - F)) || (band(r, n - F) && band(c, 0));
  const ring = (x: number, y: number, pad: string) =>
    `${pad}rect x=${x + 0.5} y=${y + 0.5} width=${F - 1} height=${F - 1} rx=2.1 fill="none" stroke="currentColor" stroke-width=1\n${pad}rect x=${x + 2} y=${y + 2} width=3 height=3 rx=1 fill="currentColor"`;
  const corners = [[0, 0], [n - F, 0], [0, n - F]];
  const head = `component ${name}
  props
    size: number
  view
    svg width=size height=size viewBox="0 0 ${n} ${n}" role="img" aria-label="QR code"
      display="block" color="rgb(255 255 255 / 0.88)" data-motion="${board ? 'qr-board' : 'qr'}"
`;
  if (!board) {
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!finder(r, c) && qr.isDark(r, c)) d += mod(c, r);
    return `${head}      path d="${d}" fill="currentColor"\n${corners.map(([x, y]) => ring(x, y, '      ')).join('\n')}\n`;
  }
  // The board's squares are all n / 8 modules wide (a fraction: n does not divide by 8), so the board is regular; a
  // module belongs to the square its centre is in.
  const w = n / 8;
  const sq = (v: number) => Math.min(7, Math.floor(v / w));
  const d: string[][] = Array.from({ length: 8 }, () => Array(8).fill(''));
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!finder(r, c) && qr.isDark(r, c)) d[sq(r + 0.5)][sq(c + 0.5)] += mod(c, r);
  const rings: string[][] = Array.from({ length: 8 }, () => Array(8).fill(''));
  for (const [x, y] of corners) rings[sq(y + F / 2)][sq(x + F / 2)] += `\n${ring(x, y, '          ')}`;
  // Every square in board order (a rank's group holds its eight squares, so the page's CSS knows each one's rank and
  // file from its place: web/head.css qr-board). A square's first child is its tint, the board's light squares (a1,
  // bottom left, dark), then its modules.
  let body = '';
  for (let i = 0; i < 8; i++) {
    body += `      g\n`;
    for (let j = 0; j < 8; j++) {
      const light = (i + j) % 2 === 0;
      body += `        g\n          rect x=${f(j * w)} y=${f(i * w)} width=${f(w)} height=${f(w)} fill="${light ? 'rgb(255 255 255 / 0.1)' : 'none'}"\n`;
      if (d[i][j]) body += `          path d="${d[i][j]}" fill="currentColor"\n`;
      if (rings[i][j]) body += rings[i][j].slice(1) + '\n';
    }
  }
  return head + body;
};
const out = `// Generated by tools/qr.ts: do not edit. ${CODES.map((c) => `${c.what} (${c.value})`).join('; ')}: drawn as the reference's StyledQRCode.
${CODES.map(component).join('\n')}`;
const file = join(import.meta.dir, '../components/qr.contract');
if (process.argv.includes('--check')) { if (readFileSync(file, 'utf8') !== out) { console.error('qr: components/qr.contract is stale: bun tools/qr.ts'); process.exit(1); } }
else { writeFileSync(file, out); console.log(`qr: ${CODES.length} codes written`); }
