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

import type { AnimationMeta } from './registry';

type IconFamilies =
  | 'AntDesign'
  | 'Entypo'
  | 'Feather'
  | 'FontAwesome'
  | 'Ionicons'
  | 'MaterialCommunityIcons'
  | 'MaterialIcons'
  | 'Octicons';

type AnimationMetaWithIcon = AnimationMeta & {
  iconColor?: string;
  iconFamily?: IconFamilies;
  iconName?: string;
};

const ICON_SIZE = 24;
const ICON_COLOR = 'white';

export const createIcon = (metadata: AnimationMeta) => {
  const meta = metadata as AnimationMetaWithIcon;
  const iconColor = meta.iconColor || ICON_COLOR;
  const iconProps = { size: ICON_SIZE, color: iconColor };

  switch (meta.iconFamily) {
    case 'AntDesign':
      return (
        <AntDesign
          name={meta.iconName as keyof typeof AntDesign.glyphMap}
          {...iconProps}
        />
      );
    case 'Entypo':
      return (
        <Entypo
          name={meta.iconName as keyof typeof Entypo.glyphMap}
          {...iconProps}
        />
      );
    case 'Feather':
      return (
        <Feather
          name={meta.iconName as keyof typeof Feather.glyphMap}
          {...iconProps}
        />
      );
    case 'FontAwesome':
      return (
        <FontAwesome
          name={meta.iconName as keyof typeof FontAwesome.glyphMap}
          {...iconProps}
        />
      );
    case 'Ionicons':
      return (
        <Ionicons
          name={meta.iconName as keyof typeof Ionicons.glyphMap}
          {...iconProps}
        />
      );
    case 'MaterialCommunityIcons':
      return (
        <MaterialCommunityIcons
          name={meta.iconName as keyof typeof MaterialCommunityIcons.glyphMap}
          {...iconProps}
        />
      );
    case 'MaterialIcons':
      return (
        <MaterialIcons
          name={meta.iconName as keyof typeof MaterialIcons.glyphMap}
          {...iconProps}
        />
      );
    case 'Octicons':
      return (
        <Octicons
          name={meta.iconName as keyof typeof Octicons.glyphMap}
          {...iconProps}
        />
      );
    default:
      return <MaterialCommunityIcons name="help" {...iconProps} />;
  }
};
