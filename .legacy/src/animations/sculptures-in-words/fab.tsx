import { StyleSheet, View } from 'react-native';

import { Feather } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { PressableScale } from 'pressto';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { ON_INK, PAPER_INK } from './constants';

import type { StyleProp, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

export const FAB_SIZE = 48;
const ICON_COLOR = ON_INK;
const ICON_SIZE = 20;
/** A 48pt disc in a screen corner: the thumb lands short of it, not on it. */
const HIT_SLOP = 16;

interface Props {
  /** 0 = showing the page, 1 = showing the bust. */
  face: SharedValue<number>;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * The one control. Its icon crossfades between type and a face as the morph
 * runs, so the button always shows what a press would give you next.
 *
 * No `filter` blur here: it blanks the native SF SymbolView, which renders in
 * its own offscreen pass.
 */
export const PortraitToggle = ({ face, onPress, style }: Props) => {
  const typeStyle = useAnimatedStyle(() => {
    const f = face.get();
    return { opacity: 1 - f, transform: [{ scale: 1 - 0.15 * f }] };
  });
  const faceStyle = useAnimatedStyle(() => {
    const f = face.get();
    return { opacity: f, transform: [{ scale: 0.85 + 0.15 * f }] };
  });

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="Switch between the article and the sculpture"
      hitSlop={HIT_SLOP}
      style={[styles.fab, style]}
      onPress={onPress}>
      <View style={styles.box} pointerEvents="none">
        <Animated.View style={[styles.layer, typeStyle]}>
          <SymbolView
            name="textformat"
            size={ICON_SIZE}
            weight="semibold"
            tintColor={ICON_COLOR}
            fallback={<Feather name="type" size={17} color={ICON_COLOR} />}
          />
        </Animated.View>
        <Animated.View style={[styles.layer, faceStyle]}>
          <SymbolView
            name="person.crop.circle"
            size={ICON_SIZE}
            weight="semibold"
            tintColor={ICON_COLOR}
            fallback={<Feather name="user" size={17} color={ICON_COLOR} />}
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
    backgroundColor: PAPER_INK,
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
