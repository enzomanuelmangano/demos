import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { AntDesign } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

const BUTTON_HEIGHT = 60;
const PADDING_HORIZONTAL = 20;
const GAP = 10;
const BACK_BUTTON_WIDTH_RATIO = 0.25;
const ICON_WIDTH = 22;
const ICON_MARGIN_RIGHT = 6;

const SPRING_CONFIG = {
  duration: 250,
  dampingRatio: 1.5,
};

type StepButtonsProps = {
  activeIndex: SharedValue<number>;
  rightLabel: string;
  backButtonLabel: string;
  onBack: () => void;
  onContinue: () => void;
};

export const StepButtons: React.FC<StepButtonsProps> = ({
  activeIndex,
  rightLabel,
  backButtonLabel,
  onBack,
  onContinue,
}) => {
  const { width: windowWidth } = useWindowDimensions();

  const backButtonWidth =
    (windowWidth - PADDING_HORIZONTAL * 2 - GAP) * BACK_BUTTON_WIDTH_RATIO;

  const backButtonProgress = useDerivedValue(() => {
    return withSpring(activeIndex.value > 0 ? 1 : 0, SPRING_CONFIG);
  });

  const iconProgress = useDerivedValue(() => {
    return withSpring(activeIndex.value === 2 ? 1 : 0, SPRING_CONFIG);
  });

  const rBackButtonStyle = useAnimatedStyle(() => {
    return {
      width: interpolate(
        backButtonProgress.value,
        [0, 1],
        [0, backButtonWidth],
      ),
      marginRight: interpolate(backButtonProgress.value, [0, 1], [0, GAP]),
      overflow: 'hidden',
    };
  }, [backButtonWidth]);

  const rBackButtonInnerStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(backButtonProgress.value, [0, 1], [0, 1]),
    };
  });

  const rIconStyle = useAnimatedStyle(() => {
    return {
      width: interpolate(iconProgress.value, [0, 1], [0, ICON_WIDTH]),
      opacity: interpolate(iconProgress.value, [0, 1], [0, 1]),
      marginRight: interpolate(
        iconProgress.value,
        [0, 1],
        [0, ICON_MARGIN_RIGHT],
      ),
    };
  });

  return (
    <View style={styles.container}>
      <Animated.View style={rBackButtonStyle}>
        <Animated.View style={rBackButtonInnerStyle}>
          <PressableScale
            onPress={onBack}
            style={[
              styles.button,
              styles.backButton,
              { width: backButtonWidth },
            ]}>
            <Animated.Text style={styles.backButtonLabel}>
              {backButtonLabel}
            </Animated.Text>
          </PressableScale>
        </Animated.View>
      </Animated.View>
      <Animated.View style={styles.fill}>
        <PressableScale
          onPress={onContinue}
          style={[styles.button, styles.continueButton]}>
          <View style={styles.labelContainer}>
            <Animated.View style={[styles.iconContainer, rIconStyle]}>
              <AntDesign name="check-circle" size={16} color="white" />
            </Animated.View>
            <Animated.Text style={styles.continueButtonLabel}>
              {rightLabel}
            </Animated.Text>
          </View>
        </PressableScale>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  backButton: {
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  backButtonLabel: {
    color: 'black',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  button: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 30,
    flexDirection: 'row',
    height: BUTTON_HEIGHT,
    justifyContent: 'center',
  },
  container: {
    flexDirection: 'row',
    height: BUTTON_HEIGHT,
    marginTop: 48,
    paddingHorizontal: PADDING_HORIZONTAL,
    width: '100%',
  },
  continueButton: {
    backgroundColor: '#0c86f7',
    flex: 1,
  },
  continueButtonLabel: {
    color: 'white',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  fill: {
    flex: 1,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  labelContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
