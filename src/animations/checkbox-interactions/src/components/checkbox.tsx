import { StyleSheet } from 'react-native';

import { AntDesign } from '@expo/vector-icons';
import Color from 'color';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
} from 'react-native-reanimated';

type CheckboxProps = {
  label: string;
  checked: boolean;
  onPress: () => void;
  activeColor?: string;
  inactiveColor?: string;
};

export const Checkbox: React.FC<CheckboxProps> = ({
  label,
  checked,
  onPress,
  activeColor = '#EF8E52',
  inactiveColor = '#B3B1B4',
}) => {
  const fadedActiveColor = Color(activeColor).alpha(0.1).rgb().toString();
  const fadedInactiveColor = Color(inactiveColor).alpha(0.1).rgb().toString();

  const rContainerStyle = useAnimatedStyle(() => {
    return {
      paddingRight: checked ? 14 : 24,
      borderColor: checked ? fadedActiveColor : fadedInactiveColor,
      borderWidth: 1.5,
      backgroundColor: checked ? fadedActiveColor : 'transparent',
    };
  }, [checked, fadedActiveColor, fadedInactiveColor]);

  const rTextStyle = useAnimatedStyle(() => {
    return {
      color: checked ? activeColor : inactiveColor,
    };
  }, [checked]);

  return (
    <Animated.View
      layout={LinearTransition.springify().mass(1).damping(30).stiffness(250)}
      onTouchEnd={onPress}
      style={[styles.container, rContainerStyle]}>
      <Animated.Text style={[styles.label, rTextStyle]}>{label}</Animated.Text>
      {checked && (
        <Animated.View
          style={{ marginLeft: 10 }}
          layout={LinearTransition}
          entering={FadeIn.duration(150).easing(
            Easing.bezier(0.895, 0.03, 0.685, 0.22).factory(),
          )}
          exiting={FadeOut.duration(150).easing(
            Easing.bezier(0.895, 0.03, 0.685, 0.22).factory(),
          )}>
          <AntDesign name="check-circle" size={20} color={activeColor} />
        </Animated.View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 36,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingLeft: 24,
    paddingVertical: 12,
  },
  label: {
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 18,
  },
});
