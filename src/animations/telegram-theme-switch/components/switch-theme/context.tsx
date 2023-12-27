import { createContext, useContext } from 'react';
import type { StyleProp, ViewStyle, Animated } from 'react-native';

type Theme = 'light' | 'dark';

const SwitchThemeContext = createContext<{
  theme: Theme;
  toggleTheme: (_: {
    center: { x: number; y: number; height: number; width: number };
    style: StyleProp<ViewStyle>;
  }) => void;
  animationProgress?: React.MutableRefObject<Animated.Value>;
}>({
  theme: 'light',
  toggleTheme: (_: {
    center: { x: number; y: number; height: number; width: number };
    style: StyleProp<ViewStyle>;
  }) => {
    //
  },
});

const useSwitchTheme = () => {
  const context = useContext(SwitchThemeContext);

  if (!context) {
    throw new Error('useSwitchTheme must be used within a SwitchThemeProvider');
  }

  return context;
};

export { SwitchThemeContext, useSwitchTheme };
export type { Theme };
