import { StyleSheet, Text, View } from 'react-native';

import Animated, {
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Palette } from '../../../constants/palette';
import { ExpandedSheetMutableProgress } from '../bottom-tab-bar/shared-progress';

type ScreenProps = {
  children?: React.ReactNode;
  title: string;
};

export function Screen({ children, title }: ScreenProps) {
  const { top: safeTop } = useSafeAreaInsets();
  const progress = ExpandedSheetMutableProgress;

  const rScreenStyle = useAnimatedStyle(() => {
    return {
      borderRadius: interpolate(progress.value, [0, 1], [0, 48]),
      borderCurve: 'continuous',
      transform: [
        {
          translateY: interpolate(progress.value, [0, 1], [0, 64]),
        },
        {
          scale: interpolate(progress.value, [0, 1], [1, 0.95]),
        },
      ],
    };
  });

  return (
    <View style={styles.screenWrapper}>
      <Animated.View
        style={[
          styles.container,
          { paddingTop: safeTop + 20, paddingHorizontal: 24 },
          rScreenStyle,
        ]}>
        <Text style={styles.title}>{title}</Text>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Palette.background,
    flex: 1,
  },
  screenWrapper: {
    backgroundColor: '#000',
    flex: 1,
  },
  title: {
    color: 'white',
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 32,
  },
});
