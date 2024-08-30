import Touchable from 'react-native-skia-gesture';
import { useImage, Image } from '@shopify/react-native-skia';
import { StatusBar } from 'expo-status-bar';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

import { BottomSheet } from './components/bottom-sheet';

const CanvasContainer = () => {
  const size = useSharedValue({ width: 0, height: 0 });
  const window = useDerivedValue(() => {
    return { width: size.value.width, height: size.value.height };
  }, [size]);
  // generated from this link: 'https://picsum.photos/2000/2000' :)
  const image = useImage(
    'https://fastly.picsum.photos/id/476/2000/2000.jpg?hmac=q5iDkmjCBOQEPQXbafsTJNZlJSaCeVzIC9spBxVEReI',
  );

  const imageWidth = useDerivedValue(() => {
    return window.value.width;
  }, [window]);

  const imageHeight = useDerivedValue(() => {
    return window.value.height;
  }, [window]);

  return (
    <>
      <StatusBar style="light" />
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
        <BottomSheet window={window} />
      </Touchable.Canvas>
    </>
  );
};

export { CanvasContainer as SkiaBottomSheet };
