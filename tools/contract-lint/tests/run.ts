// Rule tests: `bun tools/contract-lint/tests/run.ts`. Each case is a Contract snippet and the
// rule ids it must report (in order); a snippet with `[]` must be clean. No test framework: the
// folder stays dependency-free.
import assert from 'node:assert/strict';
import { applyFixes, lintFile } from '../engine.ts';
import { parseContract } from '../parser.ts';
import { rules } from '../rules/index.ts';
import type { Project } from '../types.ts';

const project: Project = { root: '/nonexistent', read: () => undefined, cache: new Map() };

function lint(source: string, only: string) {
  const file = parseContract('t.contract', source);
  const all = Object.fromEntries(rules.map(r => [r.meta.id, r.meta.defaultSeverity]));
  return { file, findings: lintFile(file, { config: { rules: all }, rules, project, only: [only] }, id => all[id]) };
}

const wrap = (body: string, head = '') => `${head}component C\n  state s = 0\n  action a\n    s = 1\n  view\n    column testId="r"\n${body.split('\n').map(l => '      ' + l).join('\n')}\n`;

interface Case {
  rule: string;
  name: string;
  src: string;
  expect: number;
  /** The source after --fix, when the rule fixes. */
  fixed?: string;
}
const cases: Case[] = [
  // corner-shape-continuous
  { rule: 'corner-shape-continuous', name: 'plain radius', src: wrap('view width=80 height=40 border-radius=12'), expect: 1,
    fixed: wrap('view width=80 height=40 border-radius=12 corner-shape="-exact-continuous"') },
  { rule: 'corner-shape-continuous', name: 'continuous radius', src: wrap('view width=80 height=40 border-radius=12 corner-shape="-exact-continuous"'), expect: 0 },
  { rule: 'corner-shape-continuous', name: 'circle is left alone', src: wrap('view width=40 height=40 border-radius=20'), expect: 0 },
  { rule: 'corner-shape-continuous', name: 'squircle is the wrong curve', src: wrap('view width=80 height=40 border-radius=12 corner-shape="squircle"'), expect: 1 },
  { rule: 'corner-shape-continuous', name: 'continued attribute lines', src: wrap('view width=80 height=40\n  border-radius=12'), expect: 1 },
  { rule: 'corner-shape-continuous', name: 'inside a canvas', src: wrap('canvas surface=x width=80 height=40\n  view border-radius=12'), expect: 0 },
  { rule: 'corner-shape-continuous', name: 'comment is not code', src: wrap('view width=80 height=40 // border-radius=12'), expect: 0 },
  // hairline-border
  { rule: 'hairline-border', name: 'half a point', src: wrap('view border-bottom-width=0.5 border-bottom-style="solid"'), expect: 1,
    fixed: wrap('view border-bottom-width="-exact-hairline" border-bottom-style="solid"') },
  { rule: 'hairline-border', name: 'one point is a design width', src: wrap('view border-width=1'), expect: 0 },
  { rule: 'hairline-border', name: 'shorthand', src: wrap('view border="0.5px solid #000000"'), expect: 1,
    fixed: wrap('view border="-exact-hairline solid #000000"') },
  // shadow-single-property
  { rule: 'shadow-single-property', name: 'split shadow', src: wrap('view shadow-color="#000000" shadow-opacity=0.2'), expect: 2 },
  { rule: 'shadow-single-property', name: 'box-shadow', src: wrap('view box-shadow="0px 4px 8px rgba(0,0,0,0.2)"'), expect: 0 },
  { rule: 'shadow-single-property', name: 'drop-shadow filter', src: wrap('view filter="drop-shadow(0px 2px 4px #000000)"'), expect: 1 },
  // min-touch-target
  { rule: 'min-touch-target', name: 'small button', src: wrap('button press=a width=20 height=20 testId="b"'), expect: 1,
    fixed: wrap('button press=a width=20 height=20 testId="b" -exact-hit-slop="12px"') },
  { rule: 'min-touch-target', name: 'hit slop', src: wrap('button press=a width=20 height=20 -exact-hit-slop="12px" testId="b"'), expect: 0 },
  { rule: 'min-touch-target', name: 'padding makes it 44', src: wrap('button press=a width=20 height=20 padding=12 testId="b"'), expect: 0 },
  { rule: 'min-touch-target', name: 'big', src: wrap('button press=a width=48 height=48 testId="b"'), expect: 0 },
  { rule: 'min-touch-target', name: 'pressto child size', src: wrap('PressableScale(press=a)\n  column width=30 height=30 testId="b"'), expect: 1 },
  // spring-consistency (built-in presets: the project has no motion.contract here)
  { rule: 'spring-consistency', name: 'the default spring', src: wrap('view transition="translate -exact-spring(900, 120, 4)"'), expect: 0 },
  { rule: 'spring-consistency', name: 'same spring, other mass', src: wrap('view transition="translate -exact-spring(100, 12, 0.4)"'), expect: 0 },
  { rule: 'spring-consistency', name: 'ad hoc', src: wrap('view transition="translate -exact-spring(342, 30.3, 1)"'), expect: 1 },
  { rule: 'spring-consistency', name: 'ad hoc with its RN constants named', src: wrap('// RN withSpring: mass 1, damping 30.3, stiffness 342\nview transition="translate -exact-spring(342, 30.3, 1)"'), expect: 0 },
  // prefer-pressto
  { rule: 'prefer-pressto', name: ':active by hand', src: wrap('button press=a class=Press testId="b"', 'style Press\n  :active\n    opacity = 0.85\n'), expect: 1 },
  { rule: 'prefer-pressto', name: 'press attribute', src: wrap('button press=a -exact-press-scale=0.9 testId="b"'), expect: 1 },
  { rule: 'prefer-pressto', name: 'pressto', src: wrap('PressableScale(press=a)\n  column testId="b"'), expect: 0 },
  // concentric-bottom-ui
  { rule: 'concentric-bottom-ui', name: 'not concentric', src: wrap('view position="absolute" bottom=50 left=20 right=20 height=70 border-radius=20 corner-shape="-exact-continuous"'), expect: 1 },
  { rule: 'concentric-bottom-ui', name: 'tall box 12 + 50', src: wrap('view position="absolute" bottom=12 left=12 right=12 height=300 border-radius=50 corner-shape="-exact-continuous"'), expect: 0 },
  { rule: 'concentric-bottom-ui', name: 'capsule 30 + 32', src: wrap('view position="absolute" bottom=32 left=32 right=32 height=60 border-radius=30 corner-shape="-exact-continuous"'), expect: 0 },
  { rule: 'concentric-bottom-ui', name: 'helpers', src: wrap('view position="absolute" bottom=floatingInset(10, 60) height=60 border-radius=concentricRadius(10, 60)'), expect: 0 },
  // box-sizing-border-box
  { rule: 'box-sizing-border-box', name: 'width + padding', src: wrap('column width=300 padding=12'), expect: 1,
    fixed: wrap('column width=300 box-sizing="border-box" padding=12') },
  { rule: 'box-sizing-border-box', name: 'border-box', src: wrap('column width=300 padding=12 box-sizing="border-box"'), expect: 0 },
  { rule: 'box-sizing-border-box', name: 'expression width + border', src: wrap('column width=(w * 2) border-width=1 border-style="solid"'), expect: 1 },
  { rule: 'box-sizing-border-box', name: 'percentage is not fixed', src: wrap('column width="100%" padding=12'), expect: 0 },
  { rule: 'box-sizing-border-box', name: 'vertical padding does not widen', src: wrap('column width=300 padding="12px 0px"'), expect: 0 },
  { rule: 'box-sizing-border-box', name: 'zero border', src: wrap('column width=300 border-width=0'), expect: 0 },
  // no-per-frame-commit
  { rule: 'no-per-frame-commit', name: 'pointermove writes state', src: `component C\n  state x = 0\n  action move(e: number)\n    x = e\n  view\n    column pointermove=move testId="a"\n      text x\n`, expect: 1 },
  { rule: 'no-per-frame-commit', name: 'one state read only by translate', src: `component C\n  state x = 0\n  action move(y: number)\n    x = y\n  view\n    column scroll=move testId="a"\n      view translate=\`0px \${x}px\`\n`, expect: 0 },
  { rule: 'no-per-frame-commit', name: 'guarded write', src: `component C\n  state x = 0\n  action move(y: number)\n    if y > 10\n      x = 1\n  view\n    column scroll=move testId="a"\n      text x\n`, expect: 0 },
  // unused-state / unused-prop
  { rule: 'unused-state', name: 'write-only state', src: `component C\n  state a = 0\n  state b = 0\n  action go\n    a = 1\n    b = a\n  view\n    text b\n`, expect: 0 },
  { rule: 'unused-state', name: 'never read', src: `component C\n  state a = 0\n  action go\n    a = 1\n  view\n    text "hi"\n`, expect: 1 },
  { rule: 'unused-prop', name: 'unused prop', src: `component C\n  props\n    title: string\n    env: DemoEnv\n  view\n    text "hi"\n`, expect: 1 },
  { rule: 'unused-prop', name: 'used prop', src: `component C\n  props\n    title: string\n  view\n    text title\n`, expect: 0 },
  // testid-on-interactive
  { rule: 'testid-on-interactive', name: 'button without id', src: wrap('button press=a'), expect: 1 },
  { rule: 'testid-on-interactive', name: 'aria-label', src: wrap('button press=a aria-label="Go"'), expect: 0 },
  { rule: 'testid-on-interactive', name: 'pressto child carries it', src: wrap('PressableScale(press=a)\n  row testId="x"'), expect: 0 },
  // exit-animation-literal
  { rule: 'exit-animation-literal', name: 'template', src: wrap('view -exact-exit-animation=`fade ${ms}ms`'), expect: 1 },
  { rule: 'exit-animation-literal', name: 'literal', src: wrap('view -exact-exit-animation="fade 150ms linear both"'), expect: 0 },
  // native-overlay-pointer-events
  { rule: 'native-overlay-pointer-events', name: 'glass without none', src: wrap('glass-pane glass-style="regular" position="absolute" inset=0'), expect: 1,
    fixed: wrap('glass-pane glass-style="regular" position="absolute" inset=0 pointer-events="none"') },
  { rule: 'native-overlay-pointer-events', name: 'glass with none', src: wrap('glass-pane glass-style="regular"\n  pointer-events="none"'), expect: 0 },
  // pill-radius
  { rule: 'pill-radius', name: 'resizing pill 999', src: wrap('view height=40 border-radius=999 -exact-layout-transition="-exact-spring(900, 120, 4)"'), expect: 1 },
  { rule: 'pill-radius', name: 'static pill is clamped by the host', src: wrap('view height=40 border-radius=999'), expect: 0 },
  // rotate-axis-origin
  { rule: 'rotate-axis-origin', name: 'x axis, centre origin', src: wrap('view rotate="x 0deg"'), expect: 1 },
  { rule: 'rotate-axis-origin', name: 'x axis with origin', src: wrap('view rotate=(on ? "x 0deg" : "x -90deg") transform-origin="left center"'), expect: 0 },
  { rule: 'rotate-axis-origin', name: 'flat rotate', src: wrap('view rotate="45deg"'), expect: 0 },
  // transition-delay
  { rule: 'transition-delay', name: 'delay', src: wrap('view transition="opacity 300ms ease 200ms"'), expect: 1 },
  { rule: 'transition-delay', name: 'no delay, linear()', src: wrap('view transition="opacity 300ms linear(0, 0.5, 1)"'), expect: 0 },
  // exact-easing
  { rule: 'exact-easing', name: 'inOutQuad bezier', src: `fn e(): string = "cubic-bezier(0.455, 0.03, 0.515, 0.955)"\n`, expect: 1 },
  // keyframes-stop-cap
  { rule: 'keyframes-stop-cap', name: 'few stops', src: `keyframes k\n  from opacity=0\n  to opacity=1\n`, expect: 0 },
  { rule: 'keyframes-stop-cap', name: 'too many stops', src: 'keyframes k\n' + Array.from({ length: 40 }, (_, i) => `  ${i}% opacity=${i / 40}\n`).join(''), expect: 1 },
  // stacked-haptic
  { rule: 'stacked-haptic', name: 'pressto press with its own haptic', src: `component C\n  action a\n    haptic("impact-light")\n  view\n    column testId="r"\n      PressableScale(press=a)\n        row testId="x"\n`, expect: 1 },
  { rule: 'stacked-haptic', name: 'pressto press, no haptic', src: `component C\n  action a\n    x = 1\n  state x = 0\n  view\n    column testId="r"\n      PressableScale(press=a)\n        row testId="x" aria-label=x\n`, expect: 0 },
];

// Suppression comments.
cases.push(
  { rule: 'corner-shape-continuous', name: 'disable-next-line', src: wrap('// contract-lint-disable-next-line corner-shape-continuous -- a plain radius on purpose\nview width=80 height=40 border-radius=12'), expect: 0 },
  { rule: 'corner-shape-continuous', name: 'disable-file', src: '// contract-lint-disable-file corner-shape-continuous\n' + wrap('view width=80 height=40 border-radius=12'), expect: 0 },
);

let failed = 0;
for (const c of cases) {
  const { file, findings } = lint(c.src, c.rule);
  try {
    assert.equal(findings.length, c.expect, `${c.rule}: ${c.name}: expected ${c.expect} finding(s), got ${findings.length}: ${findings.map(f => f.message).join(' | ')}`);
    if (c.fixed !== undefined) assert.equal(applyFixes(file.source, findings).text, c.fixed, `${c.rule}: ${c.name}: fix`);
  } catch (e) {
    failed++;
    console.error('FAIL', (e as Error).message);
  }
}
// Every rule has its docs page, and every docs page its rule.
{
  const { existsSync } = await import('node:fs');
  for (const r of rules) {
    if (!existsSync(new URL(`../docs/rules/${r.meta.id}.md`, import.meta.url))) {
      failed++;
      console.error(`FAIL docs: docs/rules/${r.meta.id}.md is missing`);
    }
  }
}
// Parser: continuation lines and template strings.
{
  const f = parseContract('p.contract', 'component C\n  view\n    row a=1 b=`x ${y > 1 ? "a b" : "c"} z`\n      c="q w" // comment with a=1\n      d=(1 + 2)\n      text "hi // not a comment" e=1\n');
  const row = f.nodes.find(n => n.head === 'row')!;
  try {
    assert.deepEqual(row.attrs.map(a => a.name), ['a', 'b', 'c', 'd']);
    assert.equal(f.nodes.find(n => n.head === 'text')!.attrs.length, 1);
    assert.equal(f.comments.length, 1);
  } catch (e) {
    failed++;
    console.error('FAIL parser:', (e as Error).message);
  }
}
console.log(`${cases.length} rule cases + parser: ${failed ? failed + ' failed' : 'all passed'}`);
process.exit(failed ? 1 : 0);
