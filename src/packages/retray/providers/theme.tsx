import React, { createContext, use, type PropsWithChildren } from 'react';

export type RetrayTheme = {
  colors: {
    background: string; // root background
    surface: string; // card/tray surface
    primary: string; // main brand / accent
    muted: string; // low-emphasis elements
    text: string; // main text
    border: string; // dividers
    overlay: string; // scrims / modal backgrounds
  };
  spacing: {
    xs: number; // 4px - minimal spacing
    sm: number; // 8px - small spacing
    md: number; // 16px - medium spacing (default)
    lg: number; // 24px - large spacing
    xl: number; // 32px - extra large spacing
    xxl: number; // 48px - extra extra large spacing
  };
  borderRadius: {
    sm: number; // small radius
    md: number; // medium radius
    lg: number; // large radius (tray)
  };
};

export const defaultTheme = {
  colors: {
    background: '#F9F9F9',
    surface: '#F9F9F9',
    primary: '#878787',
    muted: '#CCCCCC',
    text: '#333333',
    border: '#E5E5E5',
    overlay: 'rgba(0, 0, 0, 0.5)',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  borderRadius: {
    sm: 8,
    md: 16,
    lg: 32,
  },
} as const;

const RetrayThemeContext = createContext<RetrayTheme>(defaultTheme);

interface RetrayThemeProviderProps extends PropsWithChildren {
  theme?: Partial<RetrayTheme>;
}

export const RetrayThemeProvider: React.FC<RetrayThemeProviderProps> = ({
  children,
  theme,
}) => {
  const mergedTheme: RetrayTheme = {
    colors: { ...defaultTheme.colors, ...theme?.colors },
    spacing: { ...defaultTheme.spacing, ...theme?.spacing },
    borderRadius: { ...defaultTheme.borderRadius, ...theme?.borderRadius },
  };

  return (
    <RetrayThemeContext.Provider value={mergedTheme}>
      {children}
    </RetrayThemeContext.Provider>
  );
};

export const useRetrayTheme = () => {
  return use(RetrayThemeContext);
};

export const RetrayThemes = {
  light: defaultTheme,

  dark: {
    colors: {
      background: '#000000',
      surface: '#1C1C1E',
      primary: '#919191',
      muted: '#6D6D70',
      text: '#FFFFFF',
      border: '#2C2C2E',
      overlay: 'rgba(0, 0, 0, 0.7)',
    },
    spacing: defaultTheme.spacing, // Use same spacing as light theme
    borderRadius: defaultTheme.borderRadius, // Use same border radius as light theme
  } as RetrayTheme,
};
