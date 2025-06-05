import Touchable from 'react-native-skia-gesture';
import { useImage, Image } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

import { BottomSheet } from './components/bottom-sheet';

const DEFAULT_IMAGE_URL =
  'https://fastly.picsum.photos/id/476/2000/2000.jpg?hmac=q5iDkmjCBOQEPQXbafsTJNZlJSaCeVzIC9spBxVEReI';

const CanvasContainer = () => {
  const size = useSharedValue({ width: 0, height: 0 });

  // generated from this link: 'https://picsum.photos/2000/2000' :)
  const image = useImage(DEFAULT_IMAGE_URL);

  const imageWidth = useDerivedValue(() => {
    return size.value.width;
  }, [size]);

  const imageHeight = useDerivedValue(() => {
    return size.value.height;
  }, [size]);

  return (
    <Touchable.Canvas style={{ flex: 1 }} onSize={size}>
      {image && (
        <Image
          x={0}
          y={0}
          width={imageWidth}
          height={imageHeight}
          fit="cover"
          image={image}
        />
      )}
      <BottomSheet size={size} />
    </Touchable.Canvas>
  );
};

export { CanvasContainer as SkiaBottomSheet };
