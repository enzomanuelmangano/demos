import { createContext, useContext, useMemo } from 'react';

import { DarkPalette } from '../../constants/palette';

type ThemeColors = typeof DarkPalette;

interface ThemeContextType {
  colors: ThemeColors;
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
  const value = useMemo(() => {
    return {
      colors: DarkPalette,
    };
  }, []);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};
