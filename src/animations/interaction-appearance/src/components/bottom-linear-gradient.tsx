import { StyleSheet } from 'react-native';

import { memo, useMemo } from 'react';

import { Canvas, Fill, LinearGradient } from '@shopify/react-native-skia';

import { useTheme } from '../theme';

const start = {
  x: 0,
  y: 0,
};

const end = {
  x: 0,
  y: 400,
};

export const BottomLinearGradient = memo(() => {
  const { theme, colors } = useTheme();

  // This is a bit of a hack to make the gradient look good on both light and dark themes
  // Not sure what's the difference between 'rgba(0,0,0,0)' and 'rgba(255,255,255,0)
  // But somehomew there's something different between them 😅

  const LinearGradientColors = useMemo(() => {
    if (theme === 'dark') {
      return ['rgba(0,0,0,0)', 'rgba(0,0,0,0)', colors.background];
    }

    return ['rgba(255,255,255,0)', 'rgba(255,255,255,0)', colors.background];
  }, [colors.background, theme]);

  return (
    <Canvas style={styles.container}>
      <Fill>
        <LinearGradient colors={LinearGradientColors} start={start} end={end} />
      </Fill>
    </Canvas>
  );
});

const styles = StyleSheet.create({
  container: {
    bottom: 0,
    height: 400,
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
  },
});
