import { StyleSheet } from 'react-native';

import { PressableScale } from 'pressto';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';

import type { StyleProp, ViewStyle } from 'react-native';

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
    <PressableScale style={[styles.container, style]} onPress={onPress}>
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
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  container: {
    aspectRatio: 1,
    backgroundColor: 'white',
    borderRadius: 35,
    bottom: 50,
    height: 70,
    justifyContent: 'center',
    position: 'absolute',
    right: 16,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
  },
});

export { FloatingButton };
