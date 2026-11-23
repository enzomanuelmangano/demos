// Everything: web captures, iOS captures, scores, then out/index.html.
//   bun capture.ts [--rebuild] [--setup] [--skip-web] [--skip-ios] [slug…]
//   SETTLE=<ms> sets both captures' settle time (default 1500).
import { $ } from "bun";
const argv = process.argv.slice(2);
const slugs = argv.filter((a) => !a.startsWith("--"));
const dir = import.meta.dir;
if (!argv.includes("--skip-web")) await $`bun ${dir}/capture-web.ts ${argv.includes("--rebuild") ? ["--rebuild"] : []} ${slugs}`;
if (!argv.includes("--skip-ios")) await $`bun ${dir}/capture-ios.ts ${argv.includes("--setup") ? ["--setup"] : []} ${slugs}`;
await $`bun ${dir}/score.ts ${slugs}`;
await $`bun ${dir}/build-index.ts`;
