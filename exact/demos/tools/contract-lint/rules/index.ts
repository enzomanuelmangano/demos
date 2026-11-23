import type { Rule } from '../types.ts';
import cornerShape from './corner-shape-continuous.ts';
import hairline from './hairline-border.ts';
import shadow from './shadow-single-property.ts';
import touch from './min-touch-target.ts';
import spring from './spring-consistency.ts';
import pressto from './prefer-pressto.ts';
import concentric from './concentric-bottom-ui.ts';
import boxSizing from './box-sizing-border-box.ts';
import perFrame from './no-per-frame-commit.ts';
import { unusedProp, unusedState } from './unused.ts';
import testId from './testid-on-interactive.ts';
import slugs from './no-magic-slug-lists.ts';
import exitLiteral from './exit-animation-literal.ts';
import overlay from './native-overlay-pointer-events.ts';
import pill from './pill-radius.ts';
import rotate from './rotate-axis-origin.ts';
import delay from './transition-delay.ts';
import easing from './exact-easing.ts';
import stops from './keyframes-stop-cap.ts';
import haptic from './stacked-haptic.ts';

// Order: the ports of eslint-plugin-refined's rules first, then the project's own.
export const rules: Rule[] = [
  cornerShape, hairline, shadow, touch, spring, pressto,
  concentric, boxSizing, perFrame, unusedState, unusedProp, testId, slugs, exitLiteral, overlay, pill, rotate, delay, easing, stops, haptic,
];
