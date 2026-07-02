import { ICON_COLORS } from './icon-colors.generated';
import { ICON_MAP } from './icon-map.generated';

import type { ImageSourcePropType } from 'react-native';

// Temporary 1024×1024 placeholder used for every demo until a real
// assets/app-icons/<slug>.png is supplied (then re-run generate-icon-map.ts).
const PLACEHOLDER: ImageSourcePropType = require('../../../assets/app-icons/_placeholder.png');

// Real icon for the slug, or the placeholder if none has shipped yet — so
// partial icon coverage just works with no code changes.
export const getIconSource = (slug: string): ImageSourcePropType =>
  ICON_MAP[slug] ?? PLACEHOLDER;

// Flat backdrop the demo's open-zoom card expands with — derived from the
// icon's border ring at build time (see scripts/generate-icon-colors.ts) so a
// dark demo opens on a dark card instead of flashing white. Must stay in sync
// with the demo screen's pre-mount placeholder (launcher.tsx), which uses the
// same lookup: the overlay fades out over it, and any colour mismatch would
// pop at the handoff.
export const getIconBackdrop = (slug: string): string =>
  ICON_COLORS[slug] ?? '#ffffff';
