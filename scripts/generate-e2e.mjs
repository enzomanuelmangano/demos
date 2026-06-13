#!/usr/bin/env node
// Generate one ennio (Maestro-compatible) e2e flow per demo — with a
// PER-DEMO interaction tailored to what that demo actually does.
//
// Every demo renders into Skia / WebGPU canvases, so a view-tree inspector
// (`describe`) sees an opaque canvas and nothing inside it — there are no
// testIDs anywhere in the app to target. We therefore can't assert on a
// demo's internal content by id. What each flow CAN do, meaningfully:
//
//   1. deep-link straight to the demo        (demos://animations/<slug>)
//   2. assert it actually mounted            (not the "… not found" screen)
//   3. drive the DEMO'S REAL interaction      (slider → drag its track,
//      carousel → paged swipe, sudoku → Start→cell→digit, chessboard →
//      e2→e4, snake → directional flings, PIN pad → tap the keys, …).
//      These are real HID touches; the Skia/RN gesture handlers hit-test
//      the point exactly like a finger, so the demo's own interaction code
//      runs — no views required.
//   4. capture before/after screenshots       (pixels are the real
//      verification surface for a canvas)
//   5. survive                                (ennio attributes any crash to
//      the demo under test)
//
// The interaction steps come from scripts/e2e-specs.json — one entry per
// slug, authored by reading each demo's source (its primary affordance and
// where the control renders). Editing the suite = edit that JSON (or the
// demo's entry), then re-run this generator. The slug is the
// AnimationRegistry KEY (kebab-case), which `app/animations/[slug].tsx`
// resolves — NOT the `route` field.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REGISTRY = join(ROOT, 'src/animations/registry.ts');
const SPECS = join(__dirname, 'e2e-specs.json');
const OUT_DIR = join(ROOT, '.maestro/animations');
const APP_ID = 'com.reactiive.app';
const SCHEME = 'demos';

/** Slice out the body of a `export const NAME = { … };` object literal. */
function sliceObject(src, marker) {
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`marker not found: ${marker}`);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces after ${marker}`);
}

const src = readFileSync(REGISTRY, 'utf8');

// AnimationRegistry keys are the authoritative slug list / deep-link slugs.
const registryBody = sliceObject(src, 'export const AnimationRegistry');
const slugs = [];
for (const line of registryBody.split('\n')) {
  const m = line.match(/^\s*'?([a-zA-Z0-9-]+)'?\s*:\s*[A-Za-z]/);
  if (m && !line.includes('//')) slugs.push(m[1]);
}

// Native-alert demos pop a UIAlertController (outside the RN tree) that would
// otherwise wedge the next step — dismiss it best-effort after mount.
const metaBody = sliceObject(src, 'export const AnimationMetadata');
const alertSlugs = new Set();
for (const m of metaBody.matchAll(/'?([a-zA-Z0-9-]+)'?\s*:\s*\{([^}]*)\}/g)) {
  if (/alert\s*:\s*true/.test(m[2])) alertSlugs.add(m[1]);
}

// Per-demo interaction specs.
const specs = JSON.parse(readFileSync(SPECS, 'utf8'));
const bySlug = new Map(specs.map((s) => [s.slug, s]));

// Validate spec ↔ registry alignment so a renamed/removed demo fails loudly.
const missing = slugs.filter((s) => !bySlug.has(s));
const orphan = specs.map((s) => s.slug).filter((s) => !slugs.includes(s));
if (missing.length || orphan.length) {
  throw new Error(
    `spec/registry mismatch — missing specs: [${missing}] · orphan specs: [${orphan}]. ` +
      `Update scripts/e2e-specs.json.`,
  );
}

// --- minimal Maestro-step YAML emitter for our step shapes ----------------
// A step is a single-key object; the value is a scalar (inputText,
// takeScreenshot) or a flat map (tapOn/swipe/scroll/assertVisible/…).
function emitStep(step) {
  const entries = Object.entries(step);
  if (entries.length !== 1) throw new Error(`bad step: ${JSON.stringify(step)}`);
  const [key, val] = entries[0];
  if (val === null || typeof val !== 'object') {
    return `- ${key}: ${JSON.stringify(val)}`;
  }
  const lines = [`- ${key}:`];
  for (const [k, v] of Object.entries(val)) {
    lines.push(`    ${k}: ${typeof v === 'string' ? JSON.stringify(v) : v}`);
  }
  return lines.join('\n');
}

const ALLOWED = new Set([
  'tapOn',
  'swipe',
  'scroll',
  'inputText',
  'eraseText',
  'waitForAnimationToEnd',
  'takeScreenshot',
  'assertVisible',
  'assertNotVisible',
  'extendedWaitUntil',
]);

function flowFor(slug) {
  const spec = bySlug.get(slug);
  const link = `${SCHEME}://animations/${slug}`;

  for (const step of spec.steps) {
    const k = Object.keys(step)[0];
    if (!ALLOWED.has(k)) throw new Error(`${slug}: unsupported step "${k}"`);
  }

  const dismissAlert = alertSlugs.has(slug)
    ? `# this demo raises a native alert (outside the RN view tree)\n- tapOn:\n    text: "OK"\n    optional: true\n`
    : '';
  const body = spec.steps.map(emitStep).join('\n');
  const tag = spec.passive ? ' [passive — no user input; verified it renders + survives a tap]' : '';

  return `# AUTO-GENERATED by scripts/generate-e2e.mjs from scripts/e2e-specs.json — do not edit by hand.
# ${slug}: ${spec.summary}${tag}
appId: ${APP_ID}
---
- launchApp
- openLink: "${link}"
# prove the demo actually mounted (not the "Animation … not found" screen)
- extendedWaitUntil:
    notVisible: "not found"
    timeout: 8000
- waitForAnimationToEnd:
    timeout: 4000
- takeScreenshot: ".maestro/artifacts/${slug}--mounted"
${dismissAlert}# --- the demo's own interaction (real HID touches; Skia hit-tests the point) ---
${body}
- waitForAnimationToEnd:
    timeout: 4000
- takeScreenshot: ".maestro/artifacts/${slug}--after"
# still on the demo (didn't bounce to not-found) and not crashed
- assertNotVisible: "not found"
`;
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
for (const slug of slugs) writeFileSync(join(OUT_DIR, `${slug}.yaml`), flowFor(slug));

console.log(
  `Generated ${slugs.length} per-demo flows into .maestro/animations/ ` +
    `(${specs.filter((s) => s.passive).length} passive, ${alertSlugs.size} with alert-dismiss).`,
);
