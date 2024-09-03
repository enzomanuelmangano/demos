import { createTheme } from '@shopify/restyle';
import Color from 'color';

// Defining two very simple palettes for light and dark themes

export const LightPalette = {
  primary: 'black',
  background: '#FCFCFC',
  card: '#f0f0f0',
  border: Color('#A0A0A0').alpha(0.05).rgb().string(),
  text: '#A0A0A0',
};

export const DarkPalette = {
  primary: 'white',
  background: '#090909',
  card: '#1D1D1F',
  border: '#2C2C2C',
  text: '#808080',
};

const spacing = {
  none: 0,
  xxxxs: 1,
  xxxs: 2,
  xxs: 4,
  xs: 8,
  s: 12,
  m: 16,
  l: 20,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const LightTheme = createTheme({
  spacing,
  colors: {
    ...LightPalette,
  },
  textVariants: {
    defaults: {},
  },
});

export const DarkTheme = createTheme({
  spacing,
  colors: {
    ...DarkPalette,
  },
  textVariants: {
    defaults: {},
  },
});

export type Theme = typeof LightTheme | typeof DarkTheme;
