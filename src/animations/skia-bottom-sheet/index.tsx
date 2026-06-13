import { StyleSheet, Text, View } from 'react-native';

import { useState } from 'react';

import { useImage, Image } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import Touchable from 'react-native-skia-gesture';

import { BottomSheet } from './components/bottom-sheet';

const DEFAULT_IMAGE_URL =
  'https://fastly.picsum.photos/id/476/2000/2000.jpg?hmac=q5iDkmjCBOQEPQXbafsTJNZlJSaCeVzIC9spBxVEReI';

const CanvasContainer = () => {
  const size = useSharedValue({ width: 0, height: 0 });

  // e2e outcome probe: reflects the sheet open/closed state as an assertable
  // value (the sheet is rendered entirely in Skia, with no inspectable view).
  const [status, setStatus] = useState<'closed' | 'open'>('closed');

  // generated from this link: 'https://picsum.photos/2000/2000' :)
  const image = useImage(DEFAULT_IMAGE_URL);

  const imageWidth = useDerivedValue(() => {
    return size.get().width;
  }, [size]);

  const imageHeight = useDerivedValue(() => {
    return size.get().height;
  }, [size]);

  return (
    <View testID="skia-bottom-sheet-canvas" style={{ flex: 1 }}>
      <Text testID="skia-bottom-sheet-status" style={styles.statusProbe}>
        {`sheet:${status}`}
      </Text>
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
        <BottomSheet size={size} onStateChange={setStatus} />
      </Touchable.Canvas>
    </View>
  );
};

const styles = StyleSheet.create({
  // Near-invisible to the eye, but on-screen + opaque enough for the
  // accessibility/view tree to expose it to e2e (alpha >= 0.01).
  statusProbe: {
    color: '#fff',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
    zIndex: 1,
  },
});

export { CanvasContainer as SkiaBottomSheet };
