import { StyleSheet, View } from 'react-native';

import { Feather } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { PressableScale } from 'pressto';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import type { StyleProp, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

const FAB_SIZE = 48;
const ICON_COLOR = '#efe7d6';
const ICON_SIZE = 20;

interface Props {
  face: SharedValue<number>; // 0 = page icon, 1 = picture icon
  onPress: () => void;
  style?: StyleProp<ViewStyle>; // positioning from the parent
}

// FAB whose icon crossfades photo <-> textformat as `face` moves.
// No `filter` blur — it blanks the native SF SymbolView (offscreen pass).
export const PressableToggleIcon = ({ face, onPress, style }: Props) => {
  const photoStyle = useAnimatedStyle(() => {
    const f = face.get();
    return { opacity: 1 - f, transform: [{ scale: 1 - 0.15 * f }] };
  });
  const textStyle = useAnimatedStyle(() => {
    const f = face.get();
    return { opacity: f, transform: [{ scale: 0.85 + 0.15 * f }] };
  });
  return (
    <PressableScale style={[styles.fab, style]} onPress={onPress}>
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
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    height: ICON_SIZE,
    justifyContent: 'center',
    width: ICON_SIZE,
  },
  fab: {
    alignItems: 'center',
    backgroundColor: '#1c1a17',
    borderCurve: 'continuous',
    borderRadius: FAB_SIZE / 2,
    height: FAB_SIZE,
    justifyContent: 'center',
    position: 'absolute',
    width: FAB_SIZE,
  },
  layer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
});
