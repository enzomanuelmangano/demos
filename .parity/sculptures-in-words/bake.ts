// sculptures-in-words: writes gpu/images/sculptures-in-words/sculptures.bin.zlib,
// everything gpu/src/sculptures_in_words.rs reads besides the font, from the RN demo's own
// assets and code, and checks it against them.
//
//   bun .parity/sculptures-in-words/bake.ts
//
// What RN does at run time (layout.ts buildPageLayout, use-portrait-renderer.ts), and what this
// does once instead:
// - The three columns are RN Skia Paragraphs (Newsreader at 46 × 0.34, heightMultiplier 1.55,
//   left aligned, one paragraph per source line opened by an em space) laid out at
//   width × (1 − 2 × 0.09). On iOS RN Skia's Core Text typeface from data reports the variation
//   { opsz: 12 } (CTFontCopyVariation of a CTFont at size 0, its default 12 pt), which SkShaper
//   hands HarfBuzz and the strike draws at. Here RN Skia's own Paragraph module runs as
//   CanvasKit with that variation, at every whole width from W_MIN to W_MAX (and more, below):
//   1. Shaping. SkShaper's positions are whole 16.16 units and a line's x is the difference of
//      two of them (f32, exact under 256): each glyph's position along its paragraph is solved
//      from every line of every width (consistent, or the bake fails), and CanvasKit's x is
//      checked equal to f32((P − P of the line's first glyph) / 2^16) for every glyph and width.
//   2. Advances. CanvasKit's are FreeType's (1/256 px steps); iOS's are Core Text's at opsz 12
//      (advances-ct.swift), rounded to 16.16 as SkShaper hands them to HarfBuzz. The glyphs and
//      the kerning don't depend on them (one HarfBuzz, one variation), so iOS's positions are
//      CanvasKit's plus, for each glyph before it in its paragraph, the difference of the two.
//   3. Lines. Where a line may break is the text's (ICU): every place CanvasKit starts one at
//      any width. The wrap is TextWrapper's: greedy, a cluster as wide as the pen moves past it,
//      the width floored (applyRoundingHack) and LineBreakerWithLittleRounding's 1/100 rounding
//      within a quarter point. That rule on CanvasKit's advances gives CanvasKit's lines at every
//      kept width (checked); on iOS's it gives iOS's, whose tightest break is reported.
//   Every line is one step below the last (checked), so a width's height is CanvasKit's with
//   iOS's line count.
// - The point clouds: fitDiagonal(nike / thinker → the bust's diagonal) as RN runs it (doubles
//   into the Float32Array; every point is a mark's: min(points, marks) is all of them), and the
//   width-independent pairings pairClouds(bust, nike) and pairClouds(bust, thinker) in RN's code
//   (atan2 and a stable sort; no equal angles). pairByAngle depends on the width: the surface
//   runs it.
//
// sculptures.bin (zlib of, little endian):
//   "SIW1", u16 wMin, u16 wCount, u16 unionCount, u16 id[unionCount], f32 adv[unionCount]
//   per article (3): u32 marks, u16 cell[marks], i32 p[marks] (iOS's 16.16 units along the paragraph), u16 maxLines, f32 baseline[maxLines],
//                    per width: f32 height, u16 lines, u8 line[lines] (marks | 0x80 opens a paragraph)
//   per cloud (bust, nike, thinker): u32 points, f32 xyz nx ny nz ao [points × 7]
//   u32 sharedB, u16 nikeForBust[sharedB], u32 sharedC, u16 thinkerForBust[sharedC]
import { deflateSync } from 'zlib';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { execFileSync } from 'child_process';

const root = new URL('../../', import.meta.url).pathname;
const rn = `${root}.legacy/src/animations/sculptures-in-words/`;
const NM = `${root}../thank-you/.legacy/node_modules/`;
const outDir = `${root}gpu/images/sculptures-in-words/`;

const W_MIN = 320;
const W_MAX = 440;
const GLYPH_FONT_SIZE = 46;
const PAGE_GLYPH_SCALE = 0.34;
const PAGE_MARGIN_FRAC = 0.09;
const LINE_HEIGHT_FACTOR = 1.55;
const POINT_STRIDE = 7;
const BLANKS = '    ';

const CK = await require(`${NM}canvaskit-wasm/bin/full/canvaskit.js`)({
  locateFile: (f: string) => `${NM}canvaskit-wasm/bin/full/${f}`,
});
const fontData = readFileSync(`${rn}assets/Newsreader.ttf`);
const fontBuf = fontData.buffer.slice(fontData.byteOffset, fontData.byteOffset + fontData.byteLength);
const provider = CK.TypefaceFontProvider.Make();
provider.registerFont(fontBuf, 'Newsreader');
const typeface = CK.Typeface.MakeTypefaceFromData(fontBuf);

const { VENUS_ARTICLE } = await import(`${rn}text.ts`);
const { NIKE_ARTICLE } = await import(`${rn}nike-text.ts`);
const { THINKER_ARTICLE } = await import(`${rn}thinker-text.ts`);
const ARTICLES: string[] = [VENUS_ARTICLE, NIKE_ARTICLE, THINKER_ARTICLE];

const fontSize = GLYPH_FONT_SIZE * PAGE_GLYPH_SCALE;
const VARIATION = [{ axis: 'opsz', value: 12 }];
const ckFont = new CK.Font(typeface, fontSize);
const blankIds = new Set(Array.from(ckFont.getGlyphIDs(BLANKS)));
const spaceId = ckFont.getGlyphIDs(' ')[0];

const fail = (m: string) => {
  console.error(`bake: ${m}`);
  process.exit(1);
};

interface Laid {
  marks: number[]; // glyph ids
  x: number[]; // f32 x in the line
  lineMarks: number[];
  lineStart: boolean[];
  /** Every glyph of each line, blanks included: [id, x, text offset]. */
  lines: [number, number, number][][];
  baselines: number[];
  height: number;
}

const layout = (text: string, width: number): Laid => {
  const style = new CK.ParagraphStyle({
    textAlign: CK.TextAlign.Left,
    textStyle: {
      fontFamilies: ['Newsreader'],
      fontSize,
      heightMultiplier: LINE_HEIGHT_FACTOR,
      color: CK.Color(28, 26, 23, 1),
      fontVariations: VARIATION,
    },
  });
  const b = CK.ParagraphBuilder.MakeFromFontProvider(style, provider);
  for (const p of text
    .split('\n')
    .map(p => p.trim())
    .filter(Boolean)) {
    b.addText(` ${p}\n`);
  }
  const para = b.build();
  const marginX = width * PAGE_MARGIN_FRAC;
  para.layout(width - marginX * 2);
  const out: Laid = { marks: [], x: [], lineMarks: [], lineStart: [], lines: [], baselines: [], height: para.getHeight() };
  para.getShapedLines().forEach((l: any, k: number) => {
    let n = 0;
    let baseline: number | null = null;
    const all: [number, number, number][] = [];
    for (const r of l.runs) {
      for (let i = 0; i < r.glyphs.length; i++) {
        const id = r.glyphs[i];
        const x = r.positions[i * 2];
        const y = r.positions[i * 2 + 1];
        if (baseline === null) baseline = y;
        else if (y !== baseline) fail(`line ${k}: glyph y ${y} off the baseline ${baseline}`);
        if (all.length === 0 && x !== 0) fail(`line ${k} starts at x ${x}`);
        all.push([id, x, r.offsets[i]]);
        if (blankIds.has(id)) continue;
        out.marks.push(id);
        out.x.push(x);
        n++;
      }
    }
    // A paragraph's first line opens with the em space (HarfBuzz sets the missing U+2003 as the
    // space glyph, an em wide); a soft break leaves its space on the line before.
    out.lineStart.push(all.length === 0 || blankIds.has(all[0][0]));
    out.lineMarks.push(n);
    out.lines.push(all);
    out.baselines.push(baseline ?? Math.fround(l.baseline));
  });
  para.delete();
  b.delete();
  return out;
};

const f32 = Math.fround;
const FIX = 65536;
const EM = 0x2003;
// Phase 1, CanvasKit's shaping. SkShaper's positions are whole 16.16 units, and a line's x is
// the difference of two of them, exact in f32 below 256. Each glyph's position along its
// paragraph (P) is solved from those: two glyphs in one line both under 256 are exactly
// x1 − x0 apart; the em space opening a paragraph is at 0. Every pair any width shows must
// agree (else P would depend on the width).
const shaped = ARTICLES.map((text, a) => {
  const per: Laid[] = [];
  for (let w = W_MIN; w <= W_MAX; w++) per.push(layout(text, w));
  const wide = layout(text, 1e6);
  const index = new Map<string, number>();
  const seq: number[] = [];
  const paraOf: number[] = [];
  const paraStart: number[] = [];
  for (const line of wide.lines) {
    const seen = new Map<number, number>();
    line.forEach(([id, , off], j) => {
      const n = seen.get(off) ?? 0;
      seen.set(off, n + 1);
      index.set(`${off}:${n}`, seq.length);
      if (j === 0) paraStart.push(seq.length);
      paraOf.push(paraStart.length - 1);
      seq.push(id);
    });
  }
  const lineIdx = (line: [number, number, number][]) => {
    const seen = new Map<number, number>();
    return line.map(([id, , off]) => {
      const n = seen.get(off) ?? 0;
      seen.set(off, n + 1);
      const g = index.get(`${off}:${n}`);
      if (g === undefined || seq[g] !== id) fail(`article ${a}: a glyph off the wide sequence`);
      return g as number;
    });
  };
  const P = new Float64Array(seq.length).fill(NaN);
  for (const i of paraStart) P[i] = 0;
  // More widths than are kept, only to tie every glyph to a paragraph start.
  const extra: Laid[] = [];
  for (let w = 160; w <= 1400; w += w < W_MIN || w > W_MAX ? 1 : W_MAX - W_MIN + 1) extra.push(layout(text, w));
  const all = [...per, ...extra].flatMap(L => L.lines.map(line => ({ line, g: lineIdx(line) })));
  for (let changed = true; changed; ) {
    changed = false;
    for (const { line, g } of all) {
      let known = -1;
      for (let j = 0; j < line.length && line[j][1] < 256; j++) if (!Number.isNaN(P[g[j]])) { known = j; break; }
      if (known < 0) continue;
      const base = P[g[known]] - line[known][1] * FIX;
      for (let j = 0; j < line.length && line[j][1] < 256; j++) {
        const v = base + line[j][1] * FIX;
        if (!Number.isInteger(v)) fail(`article ${a}: a position off the 16.16 grid`);
        if (Number.isNaN(P[g[j]])) {
          P[g[j]] = v;
          changed = true;
        } else if (P[g[j]] !== v) fail(`article ${a}: glyph ${g[j]} at ${P[g[j]]} and ${v}`);
      }
    }
  }
  P.forEach((v, i) => Number.isNaN(v) && fail(`article ${a}: glyph ${i} never under 256 with a known one`));
  // CanvasKit's own rule, checked at every kept width: x = f32((P − P of the line's first) / 2^16).
  for (const [wi, L] of per.entries()) {
    for (const line of L.lines) {
      const g = lineIdx(line);
      line.forEach(([, x], j) => {
        if (f32((P[g[j]] - P[g[0]]) / FIX) !== x) fail(`article ${a} width ${W_MIN + wi}: x ${x} off the rule`);
      });
    }
  }
  const starts = per.map(L => L.lines.map(line => lineIdx(line)[0]));
  const extraLines = extra.map(L => L.lines.filter(l => l.length).map(line => lineIdx(line)[0]));
  return { a, per, wide, seq, paraOf, paraStart, P, lineIdx, starts, extraLines };
});

// Phase 2, iOS's advances. CanvasKit's FreeType advances are 1/256 px steps; iOS RN Skia hands
// HarfBuzz Core Text's (getWidths of the strike: advances-ct.swift; build it with swiftc -O
// first), as SkShaper does, rounded to 16.16. HarfBuzz's kerning and glyph choice don't depend
// on them (the same HarfBuzz, the same opsz 12), and the em space is HarfBuzz's own fallback
// (one em of the font's scale, on both). So iOS's P is CanvasKit's plus, for every glyph before
// it in its paragraph, the difference of the two advances.
const usedIds = [...new Set(shaped.flatMap(s => s.seq))];
const advOf = new Map<number, number>();
for (const [id, , bits] of execFileSync(`${import.meta.dir}/advances-ct`, [`${rn}assets/Newsreader.ttf`, String(f32(fontSize)), usedIds.join(',')], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .map(l => l.split(' ').map(Number))) {
  const b = new DataView(new ArrayBuffer(4));
  b.setUint32(0, bits, true);
  advOf.set(id, b.getFloat32(0, true));
}
const hbIos = (id: number) => Math.round((advOf.get(id) as number) * FIX);
// CanvasKit's advance of a glyph: the end of a run that sets its cluster's text alone (the
// glyph alone, no neighbour to kern with), read in 16.16.
const singleStyle = new CK.ParagraphStyle({ textStyle: { fontFamilies: ['Newsreader'], fontSize, fontVariations: VARIATION } });
const hbCk = new Map<number, number>();
for (const s of shaped) {
  const text = ARTICLES[s.a]
    .split('\n')
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => ` ${p}\n`)
    .join('');
  // The shaped lines' offsets are UTF-8.
  const bytes = Buffer.from(text, 'utf8');
  const offs: number[] = s.wide.lines.flatMap(line => line.map(g => g[2]));
  s.seq.forEach((id, i) => {
    if (hbCk.has(id) || s.paraStart.includes(i)) return;
    const end = offs.findIndex((o, j) => j > i && o !== offs[i]);
    const cluster = bytes.subarray(offs[i], end < 0 ? undefined : offs[end]).toString('utf8');
    // A blank alone shapes no run: set it before a lowercase letter and read that letter's x
    // (the same with n, o and x, so no kern is in it).
    const lone = cluster.replace(/\n$/, '');
    if (blankIds.has(id)) {
      const xs = ['n', 'o', 'x'].map(c => {
        const b = CK.ParagraphBuilder.MakeFromFontProvider(singleStyle, provider);
        b.addText(lone + c);
        const para = b.build();
        para.layout(1e6);
        const run = para.getShapedLines()[0].runs[0];
        if (run.glyphs[0] !== id) fail(`blank ${id}: "${lone}" shapes as ${run.glyphs[0]}`);
        const v = run.positions[2] * FIX;
        para.delete();
        b.delete();
        return v;
      });
      if (new Set(xs).size !== 1) fail(`blank ${id}: ${xs}`);
      hbCk.set(id, xs[0]);
      return;
    }
    const b = CK.ParagraphBuilder.MakeFromFontProvider(singleStyle, provider);
    b.addText(lone);
    const para = b.build();
    para.layout(1e6);
    const run = para.getShapedLines()[0]?.runs[0];
    if (!run || run.glyphs.length !== 1 || run.glyphs[0] !== id) fail(`glyph ${id}: "${cluster}" shapes as ${run && Array.from(run.glyphs)}`);
    const v = run.positions[2] * FIX;
    if (!Number.isInteger(v)) fail(`glyph ${id}: advance ${run.positions[2]} off the grid`);
    hbCk.set(id, v);
    para.delete();
    b.delete();
  });
}
const deltaMax = Math.max(...[...hbCk].map(([id, v]) => Math.abs(hbIos(id) - v)));
console.log(`advances: ${hbCk.size} glyphs, Core Text's 16.16 at most ${deltaMax} units (${(deltaMax / FIX).toFixed(5)} px) off CanvasKit's`);

// Phase 3, iOS's lines. Where SkParagraph may break (ICU's opportunities: after spaces, around
// dashes) is the text's, not the advances': every place CanvasKit starts a line at any of the
// widths laid out. Its wrap is greedy: a line takes up to the last opportunity whose content
// (trailing spaces hanging) fits the width. That rule, run on CanvasKit's own advances, must give
// CanvasKit's lines at every kept width; run on iOS's, it gives iOS's lines.
const articles = shaped.map(s => {
  const { a, per, extraLines, seq, paraOf, paraStart, P } = s;
  const isStart = new Uint8Array(seq.length);
  for (const i of paraStart) isStart[i] = 1;
  const Q = new Float64Array(seq.length);
  for (let i = 0, acc = 0; i < seq.length; i++) {
    if (isStart[i]) acc = 0;
    Q[i] = P[i] + acc;
    if (!isStart[i]) acc += hbIos(seq[i]) - (hbCk.get(seq[i]) as number);
  }
  const opportunity = new Uint8Array(seq.length);
  for (const starts of [...extraLines, ...s.starts]) for (const g of starts) if (!isStart[g]) opportunity[g] = 1;
  const ckAdv = (id: number) => hbCk.get(id) as number;
  // TextWrapper's LineBreakerWithLittleRounding (applyRoundingHack): within a quarter point of
  // the width, the width rounded to 1/100 decides. In 16.16 units in, f32 as Skia computes.
  const breakLine = (w16: number, max16: number) => {
    const width = f32(w16 / FIX);
    const maxWidth = f32(max16 / FIX);
    if (width < f32(maxWidth - 0.25)) return false;
    if (width > f32(maxWidth + 0.25)) return true;
    const rounded = f32(Math.floor(f32(width * 100) + 0.5) * f32(1 / 100));
    return rounded > maxWidth;
  };
  // The lines (their first glyphs) the greedy wrap makes at maxW (16.16), and its tightest margin.
  // On iOS a paragraph's last glyph is shaped before its hard break, which HarfBuzz there takes
  // as a space: the line ends at the glyph's advance plus its kern with a space (RN's article 0,
  // "…inscribed stone.\n": getLineMetrics 343.93 at 420, the period's pen end 344.35; its kern
  // with a space is −0.42). Read off the text: the pen step to a following space less the advance.
  const spaceKern = (X: Float64Array, adv: (id: number) => number) => {
    const k = new Map<number, number>();
    for (let i = 0; i + 1 < seq.length; i++) if (seq[i + 1] === spaceId && !isStart[i + 1] && !blankIds.has(seq[i])) k.set(seq[i], X[i + 1] - X[i] - adv(seq[i]));
    return k;
  };
  const wrap = (X: Float64Array, adv: (id: number) => number, maxW: number, endKern?: Map<number, number>) => {
    const starts: number[] = [];
    let margin = Infinity;
    for (let p = 0; p < paraStart.length; p++) {
      const from = paraStart[p];
      const to = p + 1 < paraStart.length ? paraStart[p + 1] : seq.length;
      let line = from;
      starts.push(line);
      // Content end of a line from `line` up to (not including) glyph `o`.
      const endBefore = (o: number) => {
        let k = o - 1;
        while (k > line && blankIds.has(seq[k])) k--;
        // A cluster is as wide as the pen moves past it: to the next glyph (its kern with the
        // space after it included), its advance only at the paragraph's end.
        const brk = endKern && to < seq.length ? endKern.get(seq[k]) ?? 0 : 0;
        return (k + 1 < to ? X[k + 1] : X[k] + adv(seq[k]) + brk) - X[line];
      };
      let lastFit = -1;
      for (let o = line + 1; o <= to; o++) {
        if (o < to && !opportunity[o]) continue;
        const w = endBefore(o);
        // How far the width is from flipping the rounded comparison (maxW + 1/200).
        margin = Math.min(margin, Math.abs(w - (maxW + FIX / 200)));
        if (!breakLine(w, maxW)) {
          lastFit = o;
          if (o === to) break;
        } else {
          if (lastFit < 0) fail(`article ${a}: a word wider than the column`);
          line = lastFit;
          starts.push(line);
          lastFit = -1;
          o = line;
        }
      }
    }
    return { starts, margin };
  };
  const iosKern = spaceKern(Q, hbIos);
  let tightest = Infinity;
  const lines: { starts: number[]; height: number }[] = [];
  const step = per[0].baselines[1] - per[0].baselines[0];
  for (const [wi, L] of per.entries()) {
    // ParagraphImpl::layout floors the width (applyRoundingHack, RN Skia's default too).
    const maxW = Math.floor(f32((W_MIN + wi) - (W_MIN + wi) * PAGE_MARGIN_FRAC * 2)) * FIX;
    const ck = wrap(P, ckAdv, maxW);
    const real = s.starts[wi];
    if (real.some(v => v === undefined)) fail(`article ${a}: an empty line`);
    const bad = ck.starts.findIndex((v, k) => v !== real[k]);
    if (ck.starts.length !== real.length || bad >= 0) fail(`article ${a} width ${W_MIN + wi}: the greedy wrap isn't CanvasKit's at line ${bad} (${ck.starts[bad]} vs ${real[bad]}, ${ck.starts.length} vs ${real.length})`);
    const ios = wrap(Q, hbIos, maxW, iosKern);
    tightest = Math.min(tightest, ios.margin);
    // Every line is `step` tall: CanvasKit's height, with iOS's line count.
    if (L.height !== f32(L.lines.length * step + (L.height - L.lines.length * step))) fail('height');
    lines.push({ starts: ios.starts, height: f32(L.height + (ios.starts.length - real.length) * step) });
  }
  // The baselines, every line the same step below the one before (checked), as many as iOS's
  // narrowest column has.
  per.forEach(L => L.baselines.forEach((b, k) => b !== f32(per[0].baselines[0] + k * step) && fail(`article ${a}: baseline ${k}`)));
  const maxLines = Math.max(...lines.map(l => l.starts.length));
  const baselines = Array.from({ length: maxLines }, (_, k) => f32(per[0].baselines[0] + k * step));
  // Per width: each line's mark count and whether it opens a paragraph.
  const markOf = new Int32Array(seq.length + 1);
  for (let i = 0, m = 0; i <= seq.length; i++) {
    markOf[i] = m;
    if (i < seq.length && !blankIds.has(seq[i])) m++;
  }
  const perOut = lines.map(({ starts, height }) => ({
    height,
    lineMarks: starts.map((g, k) => (g < 0 ? 0 : markOf[k + 1 < starts.length && starts[k + 1] >= 0 ? starts[k + 1] : seq.length] - markOf[g])),
    lineStart: starts.map(g => g < 0 || isStart[g] === 1),
  }));
  // A line opening mid-paragraph opens on a mark (its x is 0 from it).
  for (const { starts } of lines) for (const g of starts) if (g >= 0 && !isStart[g] && blankIds.has(seq[g])) fail('a line opens on a blank');
  const marks: number[] = [];
  const q: number[] = [];
  seq.forEach((id, i) => {
    if (!blankIds.has(id)) {
      marks.push(id);
      q.push(Q[i]);
    }
  });
  let changed = 0;
  lines.forEach((l, wi) => (l.starts.length !== s.starts[wi].length || l.starts.some((v, k) => v !== (s.starts[wi][k] ?? -1))) && changed++);
  console.log(`article ${a}: ${marks.length} marks, ${lines[lines.length - 1].starts.length}-${maxLines} lines; iOS's advances move a break at ${changed} of ${per.length} widths; the tightest break is ${(tightest / FIX).toFixed(4)} px`);
  void paraOf;
  return { marks, q, per: perOut, baselines };
});
const unionIds = [...new Set(articles.flatMap(a => a.marks))];

// Point clouds.
const load = (f: string) => {
  const b = readFileSync(`${rn}assets/${f}`);
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const bust = load('bust.bin');
const nike = load('nike.bin');
const thinker = load('thinker.bin');
const diagonal = (cloud: Float32Array) => {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < cloud.length; i += POINT_STRIDE) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], cloud[i + k]);
      hi[k] = Math.max(hi[k], cloud[i + k]);
    }
  }
  return Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
};
const fitDiagonal = (cloud: Float32Array, target: number) => {
  const k = target / diagonal(cloud);
  for (let i = 0; i < cloud.length; i += POINT_STRIDE) {
    cloud[i] *= k;
    cloud[i + 1] *= k;
    cloud[i + 2] *= k;
  }
};
const bustDiagonal = diagonal(bust);
fitDiagonal(nike, bustDiagonal);
fitDiagonal(thinker, bustDiagonal);
const countA = Math.min(Math.floor(bust.length / POINT_STRIDE), articles[0].marks.length);
const countB = Math.min(Math.floor(nike.length / POINT_STRIDE), articles[1].marks.length);
const countC = Math.min(Math.floor(thinker.length / POINT_STRIDE), articles[2].marks.length);
const sharedB = Math.min(countA, countB);
const sharedC = Math.min(countA, countC);
// pairClouds, verbatim.
const pairClouds = (a: Float32Array, b: Float32Array, count: number): Int32Array => {
  const centroid = (c: Float32Array) => {
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < count; i++) {
      cx += c[i * POINT_STRIDE];
      cy += c[i * POINT_STRIDE + 1];
    }
    return [cx / count, cy / count] as const;
  };
  const [acx, acy] = centroid(a);
  const [bcx, bcy] = centroid(b);
  const order = (c: Float32Array, cx: number, cy: number) => {
    const angles = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      angles[i] = Math.atan2(c[i * POINT_STRIDE + 1] - cy, c[i * POINT_STRIDE] - cx);
    }
    const ties = new Set<number>();
    let tie = 0;
    for (const v of angles) {
      if (ties.has(v)) tie++;
      ties.add(v);
    }
    if (tie) console.log(`pairClouds: ${tie} equal angles (the sort's stability decides them)`);
    return Array.from({ length: count }, (_, i) => i).sort((x, y) => angles[x] - angles[y]);
  };
  const aOrder = order(a, acx, acy);
  const bOrder = order(b, bcx, bcy);
  const bForA = new Int32Array(count);
  for (let k = 0; k < count; k++) {
    bForA[aOrder[k]] = bOrder[k];
  }
  return bForA;
};
const nikeForBust = pairClouds(bust, nike, sharedB);
const thinkerForBust = pairClouds(bust, thinker, sharedC);
console.log(`clouds: ${countA}/${bust.length / 7}, ${countB}/${nike.length / 7}, ${countC}/${thinker.length / 7} points used`);

// Write.
const parts: Buffer[] = [];
const u8 = (v: number[]) => parts.push(Buffer.from(Uint8Array.from(v)));
const u16 = (v: ArrayLike<number>) => parts.push(Buffer.from(Uint16Array.from(v as number[]).buffer));
const u32 = (v: number) => parts.push(Buffer.from(Uint32Array.of(v).buffer));
const fl = (v: ArrayLike<number>) => parts.push(Buffer.from(Float32Array.from(v as number[]).buffer));
parts.push(Buffer.from('SIW1'));
u16([W_MIN, W_MAX - W_MIN + 1, unionIds.length]);
u16(unionIds);
fl(unionIds.map(id => advOf.get(id) as number));
const unionIndex = new Map(unionIds.map((id, i) => [id, i]));
for (const a of articles) {
  u32(a.marks.length);
  u16(a.marks.map(id => unionIndex.get(id) as number));
  parts.push(Buffer.from(Int32Array.from(a.q).buffer));
  u16([a.baselines.length]);
  fl(a.baselines);
  for (const L of a.per) {
    fl([L.height]);
    u16([L.lineMarks.length]);
    u8(L.lineMarks.map((n, k) => n | (L.lineStart[k] ? 0x80 : 0)));
  }
}
for (const [cloud, n] of [
  [bust, countA],
  [nike, countB],
  [thinker, countC],
] as const) {
  u32(n);
  fl(cloud.subarray(0, n * POINT_STRIDE));
}
u32(sharedB);
u16(nikeForBust);
u32(sharedC);
u16(thinkerForBust);
const raw = Buffer.concat(parts);
const z = deflateSync(raw, { level: 9 });
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}sculptures.bin.zlib`, z);
console.log(`sculptures.bin: ${raw.length} bytes, ${z.length} zlib`);

// The font the surface draws the marks with: Newsreader with only these glyphs, at their ids,
// still variable (Core Text draws them at opsz 12 from fvar, avar, gvar and HVAR; without STAT it
// applies no optical size at all); no layout
// tables (the glyphs are shaped here) and no hinting (Core Text ignores it). The surface's test
// checks every mask it draws equal to the full font's.
const subset = `${root}gpu/fonts/newsreader-sculptures-subset.ttf`;
execFileSync('/usr/local/bin/python3.12', [
  '-m', 'fontTools.subset', `${rn}assets/Newsreader.ttf`,
  `--gids=${unionIds.join(',')}`, '--retain-gids', '--notdef-outline', '--no-hinting',
  '--layout-features=', '--drop-tables+=GSUB,GPOS,GDEF,DSIG,kern', '--no-recalc-bounds', '--name-IDs=*',
  `--output-file=${subset}`,
]);
console.log(`font: ${fontData.length} → ${readFileSync(subset).length} bytes (${unionIds.length} glyphs)`);
