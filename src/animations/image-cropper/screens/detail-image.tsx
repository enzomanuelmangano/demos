import {
  Canvas,
  FitBox,
  Group,
  Image,
  rect as skRect,
} from '@shopify/react-native-skia';
import { type FC } from 'react';
import { View, useWindowDimensions } from 'react-native';

import type { DetailCroppedImageRouteProp } from '../navigation';

type DetailImageScreenProps = { route: DetailCroppedImageRouteProp };

const DetailImageScreen: FC<DetailImageScreenProps> = ({
  route: {
    params: { image, rect },
  },
}) => {
  const { width } = useWindowDimensions();

  const imageRatio = image.height() / image.width();

  const fullRect = skRect(0, 0, width, width * imageRatio);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Canvas
        style={{
          width: width,
          height: width * imageRatio,
        }}>
        {/* The FitBox will arrange the cropped image to match the fullRect */}
        <FitBox src={rect} dst={fullRect}>
          <Group clip={rect}>
            <Image image={image} rect={fullRect} fit="fill" />
          </Group>
        </FitBox>
      </Canvas>
    </View>
  );
};

export { DetailImageScreen };
