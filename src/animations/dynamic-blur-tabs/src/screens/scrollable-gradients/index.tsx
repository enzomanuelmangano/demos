import { ColorValue, View, useWindowDimensions } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedScrollHandler } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IsTabBarActive } from '../../components/bottom-tab-bar/states';

const generateHarmonicColors = () => {
  const hue = Math.random() * 360;
  const saturation = 70 + Math.random() * 1;
  const lightness = 40 + Math.random() * 20;
  return [
    `hsl(${hue}, ${saturation}%, ${lightness}%)`,
    `hsl(${(hue + 30) % 360}, ${saturation}%, ${lightness}%)`,
    `hsl(${(hue + 60) % 360}, ${saturation}%, ${lightness}%)`,
  ] as const;
};

const getRandomGradientStartEnd = () => {
  const positions = ['top', 'bottom', 'left', 'right'];
  const start = positions[Math.floor(Math.random() * positions.length)];
  let end;
  do {
    end = positions[Math.floor(Math.random() * positions.length)];
  } while (end === start);
  return { start, end };
};

export const ScrollableGradients = () => {
  const { top: safeTop } = useSafeAreaInsets();
  const gradients = Array(100)
    .fill(null)
    .map(() => ({
      colors: generateHarmonicColors(),
      ...getRandomGradientStartEnd(),
    }));

  const { width, height } = useWindowDimensions();
  const padding = 8; // Reduced padding to accommodate more columns
  const gradientSize = (width - padding * 5) / 4; // Adjust size for 4 columns

  const scroll = useAnimatedScrollHandler({
    onScroll: event => {
      IsTabBarActive.value = event.contentOffset.y <= 0;
    },
  });

  const renderItem = ({
    item,
  }: {
    item: {
      colors: readonly [ColorValue, ColorValue, ...ColorValue[]];
      start: string;
      end: string;
    };
  }) => (
    <View style={{ padding: padding / 2 }}>
      <LinearGradient
        colors={item.colors}
        style={{
          width: gradientSize,
          height: gradientSize,
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.2)',
          borderRadius: 4,
          borderCurve: 'continuous',
        }}
      />
    </View>
  );

  return (
    <Animated.FlatList
      data={gradients}
      renderItem={renderItem}
      keyExtractor={(_, index) => index.toString()}
      numColumns={4}
      onScroll={scroll}
      scrollEventThrottle={16}
      style={{ backgroundColor: 'black', width, height }}
      contentContainerStyle={{ padding: padding / 2, paddingTop: safeTop }}
    />
  );
};
