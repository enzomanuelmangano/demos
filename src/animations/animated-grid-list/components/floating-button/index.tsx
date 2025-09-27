import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';

type FloatingButtonProps = {
  layout: 'grid' | 'list';
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

const FloatingButton: React.FC<FloatingButtonProps> = ({
  layout,
  onPress,
  style,
}) => {
  const isExpanded = layout === 'list';

  return (
    <TouchableOpacity
      style={[styles.container, style]}
      onPress={onPress}
      activeOpacity={0.9}>
      <Animated.View
        layout={LinearTransition}
        style={{
          flex: 1,
          flexDirection: isExpanded ? 'column' : 'row',
          flexWrap: isExpanded ? 'nowrap' : 'wrap',
          justifyContent: 'center',
          alignContent: 'center',
          paddingHorizontal: 5,
        }}>
        {new Array(isExpanded ? 2 : 4).fill(0).map((_, i) => {
          return (
            <Animated.View
              layout={LinearTransition}
              exiting={FadeOut}
              entering={FadeIn}
              key={i}
              style={{
                aspectRatio: isExpanded ? undefined : 1,
                width: isExpanded ? '70%' : undefined,
                alignSelf: 'center',
                height: isExpanded ? '20%' : '25%',
                margin: 2,
                backgroundColor: '#6283B1',
                borderRadius: isExpanded ? 4 : 2,
              }}
            />
          );
        })}
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 50,
    right: 16,
    height: 70,
    aspectRatio: 1,
    borderRadius: 35,
    backgroundColor: 'white',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    justifyContent: 'center',
  },
});

export { FloatingButton };
