// Bundles parity.ts with the RN demo's own sources for Hermes (one IIFE, no modules): the
// native packages the demo imports become stubs.ts, and use-shape-data.ts also exports its
// (module-private) computeShapeData.
//   bun exact/parity-tools/notion-qrcode/bundle.ts <out.js>
const here = new URL('./', import.meta.url).pathname;
const stubs = here + 'stubs.ts';
const native = /^(react|react-native|react-native-skia|react-native-reanimated|react-native-worklets|expo-haptics)$/;
const result = await Bun.build({
  entrypoints: [here + 'parity.ts'],
  target: 'browser',
  format: 'iife',
  minify: false,
  plugins: [
    {
      name: 'stubs',
      setup(build) {
        build.onResolve({ filter: native }, () => ({ path: stubs }));
        build.onLoad({ filter: /use-shape-data\.ts$/ }, async (args) => ({
          contents: (await Bun.file(args.path).text()) + '\nexport { computeShapeData };\n',
          loader: 'ts',
        }));
      },
    },
  ],
});
if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}
await Bun.write(process.argv[2], await result.outputs[0].text());
