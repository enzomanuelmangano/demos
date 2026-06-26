import { useWindowDimensions } from 'react-native';

import { TextImageMorph } from '../text-image-morph';
import { LITTLE_PRINCE_TEXT } from './text';

// The Little Prince: an instance of the generic text -> image morph. The page
// of text is the rose/fox farewell; it flies together into an illustration of
// the prince on his planet.
const PRINCE_IMAGE = require('./assets/prince.png');

export const TheLittlePrinceScreen = () => {
  const { width, height } = useWindowDimensions();
  return (
    <TextImageMorph
      width={width}
      height={height}
      image={PRINCE_IMAGE}
      paragraph={LITTLE_PRINCE_TEXT}
    />
  );
};
