import Animated, {
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

import { isSwitchingThemeShared } from '../../theme';

type ThemeRescalerProps = {
  children: React.ReactNode;
};

// While the theme is switching, we want to scale the content down a bit to make the transition smoother
// That's what this component does
export const ThemeRescaler: React.FC<ThemeRescalerProps> = ({ children }) => {
  const rContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: withSpring(isSwitchingThemeShared.value ? 0.95 : 1, {
            dampingRatio: 1,
            duration: 600,
          }),
        },
      ],
    };
  }, []);

  return <Animated.View style={rContainerStyle}>{children}</Animated.View>;
};
