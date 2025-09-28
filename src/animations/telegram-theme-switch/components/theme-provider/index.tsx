import { createContext, useContext, useMemo } from 'react';

import { DarkPalette, LightPalette } from '../../constants/palette';
import { useSwitchTheme } from '../switch-theme';

type ThemeColors = typeof DarkPalette;

interface ThemeContextType {
  colors: ThemeColors;
  theme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const { theme } = useSwitchTheme();

  const value = useMemo(() => {
    const colors = theme === 'dark' ? DarkPalette : LightPalette;
    return {
      colors,
      theme,
    };
  }, [theme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};
