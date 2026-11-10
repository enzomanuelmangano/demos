// Bundles parity.ts with the RN demo's own sources (and qrcode 1.5.4) for Hermes: one IIFE.
//   bun exact/parity-tools/cherry-blossom-qrcode/bundle.ts <out.js>
const here = new URL('./', import.meta.url).pathname;
const result = await Bun.build({ entrypoints: [here + 'parity.ts'], target: 'browser', format: 'iife', minify: false });
if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}
await Bun.write(process.argv[2], await result.outputs[0].text());
