import { Ionicons } from '@expo/vector-icons';

import type { AnimationMeta } from './registry';

type AnimationMetaWithIcon = AnimationMeta & {
  iconColor?: string;
  iconName?: string;
};

const ICON_SIZE = 24;
const ICON_COLOR = 'white';

export const createIcon = (metadata: AnimationMeta) => {
  const meta = metadata as AnimationMetaWithIcon;
  const iconColor = meta.iconColor || ICON_COLOR;
  const iconProps = { size: ICON_SIZE, color: iconColor };

  return (
    <Ionicons
      name={meta.iconName as keyof typeof Ionicons.glyphMap}
      {...iconProps}
    />
  );
};
