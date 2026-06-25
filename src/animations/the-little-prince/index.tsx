import { useWindowDimensions } from 'react-native';

import { TheLittlePrince } from './the-little-prince';

export const TheLittlePrinceScreen = () => {
  const { width, height } = useWindowDimensions();
  return <TheLittlePrince width={width} height={height} />;
};
