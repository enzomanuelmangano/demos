// Pixel diff of two images (PNG or JPEG), decoded and compared in Chrome itself: no image library.
// A pixel differs when any channel differs by more than `threshold` (0-255; default 32, above JPEG q70 noise).
// Returns the share of differing pixels over the overlap and the size of each image; writes a diff PNG (differing
// pixels red over a dimmed copy of the first) when `diffOut` is given.
import { readFileSync } from 'node:fs';
import type { Page } from './cdp.ts';

const dataUrl = (p: string) => `data:image/${p.endsWith('.png') ? 'png' : 'jpeg'};base64,${readFileSync(p).toString('base64')}`;

export async function diffImages(page: Page, a: string, b: string, { threshold = 32, diffOut = '' } = {}) {
  const r = await page.eval<any>(`(async () => {
    const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
    const [A, B] = await Promise.all([load(${JSON.stringify(dataUrl(a))}), load(${JSON.stringify(dataUrl(b))})]);
    const w = Math.min(A.width, B.width), h = Math.min(A.height, B.height);
    const px = (img) => { const c = new OffscreenCanvas(w, h), x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h); };
    const da = px(A), db = px(B), out = new ImageData(w, h);
    let differ = 0;
    for (let i = 0; i < da.data.length; i += 4) {
      const d = Math.max(Math.abs(da.data[i] - db.data[i]), Math.abs(da.data[i + 1] - db.data[i + 1]), Math.abs(da.data[i + 2] - db.data[i + 2]));
      if (d > ${threshold}) { differ++; out.data.set([255, 0, 0, 255], i); }
      else out.data.set([da.data[i] / 3, da.data[i + 1] / 3, da.data[i + 2] / 3, 255], i);
    }
    let png = '';
    if (${JSON.stringify(Boolean(diffOut))}) {
      const c = new OffscreenCanvas(w, h); c.getContext('2d').putImageData(out, 0, 0);
      const blob = await c.convertToBlob({ type: 'image/png' });
      png = await new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(',')[1]); f.readAsDataURL(blob); });
    }
    return { ratio: differ / (w * h), differ, a: [A.width, A.height], b: [B.width, B.height], png };
  })()`);
  if (diffOut && r.png) await Bun.write(diffOut, Buffer.from(r.png, 'base64'));
  delete r.png;
  return r as { ratio: number; differ: number; a: [number, number]; b: [number, number] };
}
