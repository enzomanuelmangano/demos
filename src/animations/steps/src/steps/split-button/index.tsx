import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { PressableScale } from 'pressto';
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

type SplitAction = {
  label: string;
  labelColor?: string;
  onPress: () => void;
  backgroundColor: string;
  icon?: React.ReactNode;
  iconVisible?: boolean;
};

type SplitButtonProps = {
  splitted: boolean;
  mainAction: SplitAction;
  leftAction: SplitAction;
  rightAction: SplitAction;
};

const ButtonHeight = 60;

const LayoutTransitionDefault = LinearTransition.duration(250);

export const SplitButton: React.FC<SplitButtonProps> = ({
  splitted,
  mainAction,
  leftAction,
  rightAction,
}) => {
  const { width: windowWidth } = useWindowDimensions();

  const paddingHorizontal = 20;
  const gap = 10;

  const splittedOffset = windowWidth * 0.45;
  const LeftSplittedButtonWidth =
    (windowWidth - paddingHorizontal * 2 - gap - splittedOffset) / 2;
  const RightSplittedButtonWidth =
    (windowWidth - paddingHorizontal * 2 - gap + splittedOffset) / 2;

  const rLeftButtonStyle = useAnimatedStyle(() => {
    const leftButtonWidth = splitted ? LeftSplittedButtonWidth : 0;
    return {
      width: withTiming(leftButtonWidth),
      opacity: withTiming(splitted ? 1 : 0),
    };
  }, [splitted]);

  const rLeftTextStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(splitted ? 1 : 0, {
        duration: 150,
      }),
    };
  }, [splitted]);

  const rMainButtonStyle = useAnimatedStyle(() => {
    const mainButtonWidth = splitted
      ? RightSplittedButtonWidth
      : LeftSplittedButtonWidth + RightSplittedButtonWidth;
    return {
      width: withTiming(mainButtonWidth),
      marginLeft: withTiming(splitted ? gap : 0),
      backgroundColor: withTiming(
        splitted ? rightAction.backgroundColor : mainAction.backgroundColor,
      ),
    };
  }, [splitted]);

  const rMainTextStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(splitted ? 0 : 1),
    };
  }, [splitted]);

  const rRightTextStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(splitted ? 1 : 0),
    };
  }, [splitted]);

  return (
    <View
      style={{
        width: '100%',
        height: ButtonHeight,
        paddingHorizontal,
        flexDirection: 'row',
      }}>
      <PressableScale
        onPress={leftAction.onPress}
        style={[
          {
            backgroundColor: leftAction.backgroundColor,
          },
          rLeftButtonStyle,
          styles.button,
        ]}>
        <Animated.Text
          layout={leftAction.iconVisible ? LayoutTransitionDefault : undefined}
          numberOfLines={1}
          style={[
            styles.label,
            rLeftTextStyle,
            {
              color: leftAction.labelColor,
            },
          ]}>
          {leftAction.iconVisible && leftAction.icon}
          {leftAction.label}
        </Animated.Text>
      </PressableScale>
      <PressableScale
        onPress={splitted ? rightAction.onPress : mainAction.onPress}
        style={[rMainButtonStyle, styles.button]}>
        <Animated.Text
          layout={mainAction.iconVisible ? LayoutTransitionDefault : undefined}
          style={[
            styles.label,
            rMainTextStyle,
            {
              color: mainAction.labelColor,
            },
          ]}>
          {mainAction.iconVisible && mainAction.icon}
          {mainAction.label}
        </Animated.Text>
        <Animated.Text
          layout={rightAction.iconVisible ? LayoutTransitionDefault : undefined}
          style={[
            styles.label,
            rRightTextStyle,
            {
              color: rightAction.labelColor,
            },
          ]}>
          {rightAction.iconVisible && rightAction.icon}
          {rightAction.label}
        </Animated.Text>
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 30,
    flexDirection: 'row',
    height: ButtonHeight,
    justifyContent: 'center',
  },
  label: {
    color: 'white',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 18,
    letterSpacing: 0.5,
    overflow: 'visible',
    position: 'absolute',
  },
});
