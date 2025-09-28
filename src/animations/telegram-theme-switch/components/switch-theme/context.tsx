import { createContext, useContext } from 'react';

import { makeMutable, type SharedValue } from 'react-native-reanimated';

import type { StyleProp, ViewStyle } from 'react-native';

type Theme = 'light' | 'dark';

const SwitchThemeContext = createContext<{
  theme: Theme;
  toggleTheme: (_: {
    center: { x: number; y: number; height: number; width: number };
    style: StyleProp<ViewStyle>;
  }) => void;
  animationProgress: SharedValue<number>;
}>({
  theme: 'light',
  toggleTheme: (_: {
    center: { x: number; y: number; height: number; width: number };
    style: StyleProp<ViewStyle>;
  }) => {
    //
  },
  animationProgress: makeMutable(0),
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
