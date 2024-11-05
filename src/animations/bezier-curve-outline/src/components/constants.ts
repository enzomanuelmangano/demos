import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

export const InitialPoints = {
  fourth: {
    x: 200,
    y: 200,
  },
  third: {
    x: width - 100,
    y: 300,
  },
  second: {
    x: width - 100,
    y: height - 300,
  },
  first: {
    x: 140,
    y: height - 200,
  },
};
