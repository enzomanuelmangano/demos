#!/usr/bin/env bun
// The /demos/ mount draws what the Demos app's own build draws: the launcher of the composed output at /demos/ against
// the same commit built at the root (base /) and served by Exact's own server, at 1440x900 and 390x844.
//   bun tools/parity/demos-same.ts <composed /demos/ url> <root-built url> <outDir>
import { launch, newPage } from './cdp.ts';
import { diffImages } from './diff.ts';
const [mounted, rooted, outDir] = process.argv.slice(2);
const { cdp, kill } = await launch({ port: 9341 });
const result: Record<string, any> = {};
for (const width of [1440, 390]) {
  for (const [name, url] of [['mounted', mounted], ['root', rooted]]) {
    const page = await newPage(cdp, width);
    await page.goto(url);
    await Bun.sleep(8000);
    const s = await page.send('Page.captureScreenshot', { format: 'png' });
    await Bun.write(`${outDir}/${name}@${width}.png`, Buffer.from(s.data, 'base64'));
    await page.close();
  }
  const page = await newPage(cdp, 1440);
  result[width] = await diffImages(page, `${outDir}/mounted@${width}.png`, `${outDir}/root@${width}.png`, { threshold: 8, diffOut: `${outDir}/diff@${width}.png` });
  await page.close();
}
console.log(JSON.stringify(result));
kill();
process.exit(0);
