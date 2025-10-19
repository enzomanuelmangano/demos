import { StyleSheet } from 'react-native';

import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { LayoutTransition } from './animations';

import type { BackgroundSectionProps } from './types';

export const BackgroundSection = ({
  width,
  left,
  listPadding,
  listColor,
}: BackgroundSectionProps) => {
  if (width === 0) return null;

  return (
    <Animated.View
      entering={FadeIn}
      exiting={FadeOut}
      layout={LayoutTransition}
      style={[
        styles.backgroundSection,
        {
          left: left - listPadding,
          backgroundColor: listColor,
          width: width + 2 * listPadding,
          bottom: -listPadding,
          top: -listPadding,
        },
      ]}
    />
  );
};

const styles = StyleSheet.create({
  backgroundSection: {
    borderCurve: 'continuous',
    borderRadius: 999,
    position: 'absolute',
    zIndex: 0,
  },
});
