import { StyleSheet, View } from 'react-native';

import { Feather } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

const ICON_COLOR = '#efe7d6';
const ICON_SIZE = 20;

// photo (page) <-> textformat (picture), crossfaded with a blur + scale bridge.
export const ToggleIcon = ({ face }: { face: SharedValue<number> }) => {
  const photoStyle = useAnimatedStyle(() => {
    const f = face.get();
    return {
      opacity: 1 - f,
      transform: [{ scale: 1 - 0.15 * f }],
      filter: [{ blur: 2 * f }],
    };
  });
  const textStyle = useAnimatedStyle(() => {
    const f = face.get();
    return {
      opacity: f,
      transform: [{ scale: 0.85 + 0.15 * f }],
      filter: [{ blur: 2 * (1 - f) }],
    };
  });
  return (
    <View style={styles.box} pointerEvents="none">
      <Animated.View style={[styles.layer, photoStyle]}>
        <SymbolView
          name="photo"
          size={ICON_SIZE}
          weight="semibold"
          tintColor={ICON_COLOR}
          fallback={<Feather name="image" size={17} color={ICON_COLOR} />}
        />
      </Animated.View>
      <Animated.View style={[styles.layer, textStyle]}>
        <SymbolView
          name="textformat"
          size={ICON_SIZE}
          weight="semibold"
          tintColor={ICON_COLOR}
          fallback={<Feather name="type" size={17} color={ICON_COLOR} />}
        />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    height: ICON_SIZE,
    justifyContent: 'center',
    width: ICON_SIZE,
  },
  layer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
});
