import { StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { FC } from 'react';

import { BlurView } from 'expo-blur';

type OverlayProps = {
  style: StyleProp<ViewStyle>;
};

export const Overlay: FC<OverlayProps> = ({ style }) => {
  return (
    <BlurView
      style={[
        {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: 'rgba(255,255,255,0.5)',
        },
        style,
      ]}
      intensity={50}
      tint="dark"
    />
  );
};
