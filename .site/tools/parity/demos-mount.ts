#!/usr/bin/env bun
// Spike S1 (docs/decisions.md): the Demos app mounted at /demos/ of the composed output, end to end.
//   bun tools/parity/demos-mount.ts <origin> <outDir>
// For 1440x900 (framed iPhone Air) and 390x844 (full screen, touch): /demos/ cold, a GPU demo by deep link
// (/demos/demo/chessboard), its reload, Back to /demos/ and Forward; every non-2xx response, the GPU module's and the
// shader bundle's URLs, exceptions, and a screenshot of each step.
import { launch, newPage } from './cdp.ts';
const [origin, outDir] = process.argv.slice(2);
const { cdp, kill } = await launch();
const report: any = {};
for (const width of [1440, 390]) {
  const page = await newPage(cdp, width);
  const log: any = { failed: [] as string[], gpu: [] as string[], errors: [] as string[], steps: {} as Record<string, any> };
  page.on((e) => {
    if (e.method === 'Network.responseReceived') {
      const { url, status } = e.params.response;
      if (status >= 400) log.failed.push(`${status} ${url}`);
      if (/gpu_bg\.wasm|shaders\.wgsl|\/shaders\//.test(url)) log.gpu.push(`${status} ${url.replace(origin, '')}`);
    }
    if (e.method === 'Network.loadingFailed') log.failed.push(`failed ${e.params.errorText}`);
    if (e.method === 'Runtime.exceptionThrown') log.errors.push(e.params.exceptionDetails?.exception?.description?.slice(0, 300) ?? 'exception');
  });
  const state = () => page.eval(`({ url: location.pathname, title: document.title, canvases: document.querySelectorAll('canvas').length, nodes: document.querySelectorAll('#exact-root *').length, description: document.querySelector('meta[name=description]')?.content ?? null })`);
  const shot = async (name: string) => {
    const s = await page.send('Page.captureScreenshot', { format: 'png' });
    await Bun.write(`${outDir}/${name}@${width}.png`, Buffer.from(s.data, 'base64'));
    log.steps[name] = await state();
  };
  await page.goto(`${origin}/demos`); await Bun.sleep(6000); await shot('launcher');
  await page.goto(`${origin}/demos/demo/chessboard`); await Bun.sleep(9000); await shot('deeplink');
  await page.send('Page.reload'); await Bun.sleep(9000); await shot('reload');
  const { currentIndex, entries } = await page.send('Page.getNavigationHistory');
  await page.send('Page.navigateToHistoryEntry', { entryId: entries[currentIndex - 1].id }); await Bun.sleep(5000); await shot('back');
  await page.send('Page.navigateToHistoryEntry', { entryId: entries[currentIndex].id }); await Bun.sleep(6000); await shot('forward');
  report[width] = log;
  await page.close();
}
await Bun.write(`${outDir}/demos-mount.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
kill();
process.exit(0);
