import { View, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import { BOTTOM_BAR_HEIGHT } from '../../components/bottom-tab-bar';
import { useActiveTabBarContext } from '../../components/bottom-tab-bar/active-tab-bar-provider';
import { useTheme } from '../../components/theme-provider';

const HomeScreen = () => {
  const { isActive } = useActiveTabBarContext();
  const { colors } = useTheme();

  const prevContentOffsetY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: event => {
      const positiveOffsetY = Math.max(event.contentOffset.y, 0);
      const positivePrevOffsetY = Math.max(prevContentOffsetY.value, 0);

      const isScrollingUp = positivePrevOffsetY - positiveOffsetY >= 0;

      isActive.value = isScrollingUp;

      prevContentOffsetY.value = event.contentOffset.y;
    },
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Animated.FlatList
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: BOTTOM_BAR_HEIGHT,
        }}
        data={new Array(50).fill(0)}
        renderItem={() => (
          <View style={[styles.listItem, { borderColor: colors.border }]} />
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listItem: {
    height: 100,
    borderBottomWidth: 1,
  },
});

export { HomeScreen };
