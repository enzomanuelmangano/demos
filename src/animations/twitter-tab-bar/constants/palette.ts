import Color from 'color';

export const DarkPalette = {
  primary: '#4A9AE9',
  background: '#17202A',
  card: Color('#17202A').lighten(0.15).hex(),
  border: Color('#FFFFFF').darken(0.65).hex(),
  text: '#FFFFFF',
};

export const LightPalette = {
  primary: '#4A9AE9',
  background: '#FFFFFF',
  card: Color('#0088CC').hex(),
  border: Color('#17202A').lighten(0.65).hex(),
  text: '#FFF',
};

// Keep backward compatibility
export const Palette = DarkPalette;
