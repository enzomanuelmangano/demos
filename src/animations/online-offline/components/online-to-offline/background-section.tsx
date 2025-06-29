import Animated from 'react-native-reanimated';
import { StyleSheet } from 'react-native';

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
    position: 'absolute',
    zIndex: 0,
    borderRadius: 999,
    borderCurve: 'continuous',
  },
});
