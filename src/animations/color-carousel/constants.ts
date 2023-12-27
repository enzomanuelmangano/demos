import Color from 'color';
import { Dimensions } from 'react-native';

const colors = [
  '#336699',
  '#6699CC',
  '#99CCFF',
  '#CCCCFF',
  '#99CC99',
  '#CCFFCC',
  '#FFFF99',
  '#FFCC99',
  '#FF9999',
  '#FFCCCC',
  '#FF99CC',
  '#CC99FF',
  '#9966CC',
  '#663399',
  '#FF9966',
  '#FF6600',
  '#CC6600',
  '#996600',
  '#FFCC00',
  '#FFFF00',
].map(color => {
  return {
    mainColor: color,
    accentColor: Color(color).darken(0.1).hex(),
  };
});

const data = [null, null, ...colors, null, null];

const BACKGROUND_COLOR = '#111111';

const { width: windowWidth } = Dimensions.get('window');

export { colors, data, BACKGROUND_COLOR, windowWidth };
