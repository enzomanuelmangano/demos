import { StyleSheet, View } from 'react-native';

import { type FC, memo } from 'react';

import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import { ReText } from 'react-native-redash';

type ProgressBarAreaProps = {
  isVisible: SharedValue<boolean>;
  progress: SharedValue<number>;
};

const ProgressBarArea: FC<ProgressBarAreaProps> = memo(
  ({ isVisible, progress }) => {
    const rAnimatedStyle = useAnimatedStyle(() => {
      return {
        opacity: withTiming(isVisible.value ? 1 : 0),
      };
    });

    const rProgressBarAnimatedStyle = useAnimatedStyle(() => {
      const width = interpolate(
        progress.value,
        [0, 1],
        [0, 100],
        Extrapolation.CLAMP,
      );

      return {
        width: `${width}%`,
      };
    });

    const animatedPercentage = useDerivedValue(() => {
      return `${Math.round(progress.value * 100)}%`;
    });

    return (
      <Animated.View
        style={[
          {
            flex: 1,
            backgroundColor: '#2E2D2E',
            paddingHorizontal: 10,
            borderRadius: 40,
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'row',
            margin: 5,
          },
          rAnimatedStyle,
        ]}>
        <ReText
          style={{
            color: '#9E9E9E',
            fontSize: 15,
            width: 50,
            textAlign: 'center',
          }}
          text={animatedPercentage}
        />
        <View
          style={{
            height: 5,
            width: '70%',
            backgroundColor: '#fff',
            borderRadius: 40,
            overflow: 'hidden',
          }}>
          <Animated.View
            style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: '#1A1A1A',
            }}
          />
          <Animated.View
            style={[
              {
                ...StyleSheet.absoluteFillObject,
                backgroundColor: '#9E9E9E',
              },
              rProgressBarAnimatedStyle,
            ]}
          />
        </View>
      </Animated.View>
    );
  },
);

export { ProgressBarArea };
