import { StyleSheet } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { PressableOpacity } from 'pressto';
import Animated, {
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { useIsShaking } from './hooks';
import { useShakingAnimation } from './hooks/use-shaking-animation';

import type { AppData } from './constants';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * Props for the AppItem component
 * @property item - Data for the app including colors and ID
 * @property onLongPress - Callback to trigger edit mode
 * @property onDelete - Optional callback to handle item deletion
 * @property style - Additional styles to apply to the container
 */
interface AppItemProps {
  item: AppData;
  onLongPress: () => void;
  onDelete?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Size of the close/delete icon button in pixels
 */
const CloseIconButtonSize = 12;

/**
 * AppItem component displays an individual app tile with gradient background
 * and delete functionality when in shaking mode.
 *
 * Features:
 * - Gradient background using provided colors
 * - Delete button that appears during shake mode
 * - Shaking animation when in edit mode
 * - Shadow effects for depth
 */
export const AppItem: React.FC<AppItemProps> = ({
  item,
  onLongPress,
  onDelete,
  style,
}) => {
  const { isShaking } = useIsShaking();
  const { rShakingStyle } = useShakingAnimation(item.id);

  // Controls visibility and interactivity of delete button based on shaking state
  const rDeleteButtonContainerStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isShaking.value ? 1 : 0),
    pointerEvents: isShaking.value ? 'auto' : 'none',
  }));

  return (
    <Animated.View
      style={[styles.itemContainer, rShakingStyle, style]}
      layout={LinearTransition.duration(350)}
      exiting={FadeOut}>
      {/* Main touchable area for the app item */}
      <PressableOpacity style={styles.touchable} onLongPress={onLongPress}>
        {/* Delete button overlay */}
        <Animated.View
          style={[styles.deleteButtonContainer, rDeleteButtonContainerStyle]}>
          <PressableOpacity
            onPress={onDelete}
            style={styles.deleteButton}
            hitSlop={DeleteButtonHitSlop}>
            <Ionicons name="remove" size={CloseIconButtonSize} color="black" />
          </PressableOpacity>
        </Animated.View>

        {/* Gradient background */}
        <LinearGradient
          colors={item.colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        />
      </PressableOpacity>
    </Animated.View>
  );
};

/**
 * Extended touch area for the delete button to improve usability
 */
const DeleteButtonHitSlop = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
  deleteButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderCurve: 'continuous',
    borderRadius: 100,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  deleteButtonContainer: {
    left: -4,
    position: 'absolute',
    top: -4,
    zIndex: 1,
  },
  gradient: {
    borderCurve: 'continuous',
    borderRadius: 16,
    flex: 1,
    overflow: 'hidden',
  },
  itemContainer: {
    aspectRatio: 1,
  },
  touchable: {
    elevation: 2,
    flex: 1,
    shadowColor: '#b8b8b8',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
});
