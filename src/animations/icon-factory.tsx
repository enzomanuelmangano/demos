import {
  AntDesign,
  Entypo,
  Feather,
  FontAwesome,
  Ionicons,
  MaterialCommunityIcons,
  MaterialIcons,
  Octicons,
} from '@expo/vector-icons';
import React from 'react';

import type { AnimationMeta } from './registry';

const ICON_SIZE = 24;
const ICON_COLOR = 'white';

export const createIcon = (metadata: AnimationMeta) => {
  const iconColor = (metadata as any).iconColor || ICON_COLOR;
  const iconProps = { size: ICON_SIZE, color: iconColor };

  switch ((metadata as any).iconFamily) {
    case 'AntDesign':
      return (
        <AntDesign name={(metadata as any).iconName as any} {...iconProps} />
      );
    case 'Entypo':
      return <Entypo name={(metadata as any).iconName as any} {...iconProps} />;
    case 'Feather':
      return (
        <Feather name={(metadata as any).iconName as any} {...iconProps} />
      );
    case 'FontAwesome':
      return (
        <FontAwesome name={(metadata as any).iconName as any} {...iconProps} />
      );
    case 'Ionicons':
      return (
        <Ionicons name={(metadata as any).iconName as any} {...iconProps} />
      );
    case 'MaterialCommunityIcons':
      return (
        <MaterialCommunityIcons
          name={(metadata as any).iconName as any}
          {...iconProps}
        />
      );
    case 'MaterialIcons':
      return (
        <MaterialIcons
          name={(metadata as any).iconName as any}
          {...iconProps}
        />
      );
    case 'Octicons':
      return (
        <Octicons name={(metadata as any).iconName as any} {...iconProps} />
      );
    default:
      return <MaterialCommunityIcons name="help" {...iconProps} />;
  }
};
