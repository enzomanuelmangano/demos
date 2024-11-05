import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { ExpandedSheetMutableProgress } from '../bottom-tab-bar/shared-progress';
import { Palette } from '../../../constants/palette';

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
  screenWrapper: {
    flex: 1,
    backgroundColor: '#000',
  },
  container: {
    backgroundColor: Palette.background,
    flex: 1,
  },
  title: {
    fontSize: 24,
    color: 'white',
    marginBottom: 32,
    fontWeight: '600',
  },
});
