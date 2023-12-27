import Touchable from 'react-native-skia-gesture';
import {
  Selector,
  useComputedValue,
  useImage,
  Image,
  useValue,
} from '@shopify/react-native-skia';
import { StatusBar } from 'expo-status-bar';

import { BottomSheet } from './components/bottom-sheet';

const CanvasContainer = () => {
  const size = useValue({ width: 0, height: 0 });
  const window = useComputedValue(() => {
    return { width: size.current.width, height: size.current.height };
  }, [size]);
  // generated from this link: 'https://picsum.photos/2000/2000' :)
  const image = useImage(
    'https://fastly.picsum.photos/id/476/2000/2000.jpg?hmac=q5iDkmjCBOQEPQXbafsTJNZlJSaCeVzIC9spBxVEReI',
  );

  return (
    <>
      <StatusBar style="light" />
      <Touchable.Canvas style={{ flex: 1 }} onSize={size}>
        {image && (
          <Image
            x={0}
            y={0}
            width={Selector(window, w => w.width)}
            height={Selector(window, w => w.height)}
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
