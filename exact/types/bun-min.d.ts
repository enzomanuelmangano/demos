// What the tooling needs of Bun, declared by hand because `bun-types` is not installed here (and
// the check should run offline). `Bun` is typed `any`: replace this file with
// `"types": ["node", "bun-types"]` in tsconfig.json once `bun-types` is a dependency, and the
// scripts' Bun calls get real types.
interface ImportMeta {
  /** Directory of the current file (Bun). */
  readonly dir: string;
  /** Path of the current file (Bun). */
  readonly path: string;
  /** True when the file is the entry point (Bun). */
  readonly main: boolean;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Bun: any;
declare module 'bun' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const $: any;
  const bun: any;
  export default bun;
}
// Untyped packages the parity tools import from the repo's node_modules.
declare module '*/qrcode/lib/index.js';
declare module '*/canvaskit-wasm/bin/canvaskit.js';
