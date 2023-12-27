import { MotiView, motify } from 'moti';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  FadeOut,
  Layout,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Color from 'color';

import { ActivityIndicator, type ActivityStatus } from './activity-indicator';

// Type definitions for the props of the LoadingButton component
type LoadingButtonProps = {
  onPress?: () => Promise<void>;
  style?: StyleProp<ViewStyle>;
  status: ActivityStatus;
  colorFromStatusMap: Record<ActivityStatus, string>;
  titleFromStatusMap?: Record<ActivityStatus, string>;
};

// Creation of an animated Text component using motify
const MotifiedAnimatedText = motify(Animated.Text)();

const LoadingButton: React.FC<LoadingButtonProps> = ({
  onPress,
  style,
  status,
  colorFromStatusMap,
  titleFromStatusMap,
}) => {
  // Shared value to determine if the button is active
  const isActive = useSharedValue(false);

  // Define the tap gesture for the button
  const gesture = Gesture.Tap()
    .maxDuration(4000)
    .onTouchesDown(() => {
      isActive.value = true; // Set button as active when touched
    })
    .onTouchesUp(() => {
      if (onPress) {
        runOnJS(onPress)(); // Run the onPress function when the button is released
      }
    })
    .onFinalize(() => {
      isActive.value = false; // Reset the button state when the gesture is finalized
    });

  // Define the scale of the button based on its active state
  const scale = useDerivedValue(() => {
    return withSpring(isActive.value ? 0.9 : 1);
  });

  // Determine the active color based on the status prop
  const activeColor = useMemo(() => {
    return colorFromStatusMap?.[status ?? 'idle'];
  }, [colorFromStatusMap, status]);

  // Define the animated styles for the button based on its scale
  const rStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: scale.value,
        },
      ],
    };
  }, []);

  // Render the animated button component
  return (
    <>
      <GestureDetector gesture={gesture}>
        <Animated.View layout={Layout.duration(500)} style={rStyle}>
          <MotiView
            transition={{
              type: 'timing',
              duration: 1000,
            }}
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 20,
              },
              style,
            ]}
            animate={{
              backgroundColor: Color(activeColor).lighten(0.6).hex(),
            }}>
            <ActivityIndicator status={status} color={activeColor} />

            <MotifiedAnimatedText
              entering={FadeIn}
              exiting={FadeOut}
              transition={{
                type: 'timing',
                duration: 1000,
              }}
              animate={{
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                color: activeColor,
              }}
              style={[styles.title]}>
              {titleFromStatusMap?.[status ?? 'idle']}
            </MotifiedAnimatedText>
          </MotiView>
        </Animated.View>
      </GestureDetector>
    </>
  );
};

// Define static styles for the component
const styles = StyleSheet.create({
  title: {
    fontWeight: 'bold',
    fontSize: 20,
  },
});

// Export the LoadingButton component
export { LoadingButton };
