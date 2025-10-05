import { StyleProp, ViewStyle } from 'react-native';

import { FC } from 'react';

import { GlassView } from 'expo-glass-effect';

type OverlayProps = {
  style: StyleProp<ViewStyle>;
};

export const Overlay: FC<OverlayProps> = ({ style }) => {
  return (
    <GlassView
      style={style}
      glassEffectStyle="clear"
      isInteractive={false}
      tintColor="rgba(0,0,0,0.5)"
    />
  );
};
