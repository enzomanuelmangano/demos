import { ICON_MAP } from './icon-map.generated';

import type { ImageSourcePropType } from 'react-native';

// Temporary 1024×1024 placeholder used for every demo until a real
// assets/app-icons/<slug>.png is supplied (then re-run generate-icon-map.ts).
const PLACEHOLDER: ImageSourcePropType = require('../../../assets/app-icons/_placeholder.png');

// Real icon for the slug, or the placeholder if none has shipped yet — so
// partial icon coverage just works with no code changes.
export const getIconSource = (slug: string): ImageSourcePropType =>
  ICON_MAP[slug] ?? PLACEHOLDER;
