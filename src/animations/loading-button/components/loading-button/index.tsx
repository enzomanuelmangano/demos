import { MotiView } from 'moti';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';
import Color from 'color';
import { PressableScale } from 'pressto';

import { ActivityIndicator, type ActivityStatus } from './activity-indicator';

// Type definitions for the props of the LoadingButton component
type LoadingButtonProps = {
  onPress?: () => Promise<void>;
  style?: StyleProp<ViewStyle>;
  status: ActivityStatus;
  colorFromStatusMap: Record<ActivityStatus, string>;
  titleFromStatusMap?: Record<ActivityStatus, string>;
};

const LoadingButton: React.FC<LoadingButtonProps> = ({
  onPress,
  style,
  status,
  colorFromStatusMap,
  titleFromStatusMap,
}) => {
  // Determine the active color based on the status prop
  const activeColor = useMemo(() => {
    return colorFromStatusMap[status] || colorFromStatusMap.idle;
  }, [colorFromStatusMap, status]);

  // Render the animated button component
  return (
    <PressableScale onPress={onPress} layout={LinearTransition}>
      <MotiView
        transition={{
          backgroundColor: {
            type: 'timing',
            duration: 1000,
          },
        }}
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
          },
          style,
        ]}
        animate={{
          backgroundColor: Color(activeColor).lighten(0.6).hex(),
        }}>
        <ActivityIndicator status={status} color={activeColor} />
        <Animated.Text
          entering={FadeIn}
          exiting={FadeOut}
          style={[
            styles.title,
            {
              color: activeColor,
            },
          ]}>
          {titleFromStatusMap?.[status] || ''}
        </Animated.Text>
      </MotiView>
    </PressableScale>
  );
};

// Define static styles for the component
const styles = StyleSheet.create({
  title: {
    fontWeight: 'bold',
    fontSize: 14,
  },
});

// Export the LoadingButton component
export { LoadingButton };
