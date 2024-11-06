import { AntDesign } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import { PressableScale } from 'pressto';

type TabProps = {
  label: string;
  maxWidth: number;
  minWidth: number;
  isActive: boolean;
  onPress: () => void;
  icon: keyof typeof AntDesign.glyphMap;
};

const IconSize = 20;

export const Tab = ({
  label,
  maxWidth,
  minWidth,
  isActive,
  onPress,
  icon,
}: TabProps) => {
  // Create an animated progress value that transitions between 0 and 1
  // based on whether the tab is active or not
  const progress = useDerivedValue(() => {
    return withTiming(isActive ? 1 : 0, {
      duration: 300, // Animation duration in milliseconds
    });
  }, [isActive]);

  // Animate the tab width between minWidth and maxWidth based on the progress
  const rTabStyle = useAnimatedStyle(() => {
    return {
      width: interpolate(progress.value, [0, 1], [minWidth, maxWidth]),
    };
  }, [isActive]);

  // Animate the gap between icon and text from 0 to 15 based on the progress
  const gap = useDerivedValue(() => {
    return interpolate(progress.value, [0, 1], [0, 15]);
  }, []);

  // Animate the text opacity and left margin based on the progress
  const rTextStyle = useAnimatedStyle(() => {
    return {
      opacity: progress.value ** 3, // Cubic easing for opacity
      marginLeft: gap.value, // Dynamic left margin
    };
  }, [isActive]);

  // Animate the icon's horizontal position based on the progress
  const rIconStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      progress.value,
      [0, 1],
      [(minWidth - IconSize) / 2, IconSize], // Move from center to left
    );
    return {
      left: translateX,
      position: 'absolute',
    };
  }, []);

  return (
    <PressableScale onPress={onPress}>
      <Animated.View style={[rTabStyle, styles.container]}>
        <View style={styles.innerContainer}>
          <Animated.View style={[styles.iconContainer, rIconStyle]}>
            <AntDesign name={icon} size={IconSize} color="black" />
          </Animated.View>
          <Animated.Text
            numberOfLines={1}
            key={label}
            style={[styles.label, rTextStyle]}>
            {label}
          </Animated.Text>
        </View>
      </Animated.View>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 60,
    backgroundColor: '#f1f1f1',
    borderRadius: 15,
    borderCurve: 'continuous',
    justifyContent: 'center',
  },
  innerContainer: {
    flexDirection: 'row',
    width: '100%',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    zIndex: 100,
  },
  iconContainer: {
    width: IconSize,
    height: IconSize,
    zIndex: 100,
    backgroundColor: '#f1f1f1',
  },
});
