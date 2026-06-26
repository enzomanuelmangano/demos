import { StyleSheet, View } from 'react-native';

import { useRef, useState } from 'react';

import { Canvas } from '@shopify/react-native-skia';
import { usePatternComposer } from 'react-native-pulsar';
import {
  Easing,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { MORPH_DURATION_MS, PAGE_BG, PAGE_MARGIN_FRAC } from './constants';
import { MORPH_PATTERN } from './haptics';
import { PressableToggleIcon } from './pressable-toggle-icon';
import { Reveal } from './reveal';
import { useTextImageMorph } from './use-text-image-morph';

import type { DataSourceParam } from '@shopify/react-native-skia';

interface Props {
  width: number;
  height: number;
  image: DataSourceParam;
  paragraph: string;
}

export const TextImageMorph = ({ width, height, image, paragraph }: Props) => {
  const data = useTextImageMorph({ image, paragraph, width, height });
  const progress = useSharedValue(0); // 0 = page, 1 = picture
  const face = useSharedValue(0);
  const [revealed, setRevealed] = useState(false);
  const lastToggleRef = useRef(0);
  const morphHaptic = usePatternComposer(MORPH_PATTERN);

  const toggle = () => {
    const now = Date.now();
    if (now - lastToggleRef.current < 400) {
      return; // debounce double-fire
    }
    lastToggleRef.current = now;
    const next = !revealed;
    setRevealed(next);
    morphHaptic.play();
    progress.set(
      withSpring(next ? 1 : 0, {
        dampingRatio: 1,
        duration: MORPH_DURATION_MS,
      }),
    );
    face.set(
      withTiming(next ? 1 : 0, {
        duration: 240,
        easing: Easing.out(Easing.cubic),
      }),
    );
  };

  return (
    <View style={[styles.fill, { backgroundColor: PAGE_BG }]}>
      <Canvas style={styles.fill}>
        {data.ready && data.font && (
          <Reveal
            pageXY={data.pageXY}
            sprites={data.sprites}
            font={data.font}
            atlas={data.atlas}
            targets={data.targets}
            progress={progress}
            screenW={width}
            screenH={height}
          />
        )}
      </Canvas>

      <PressableToggleIcon
        face={face}
        onPress={toggle}
        style={{
          bottom: width * PAGE_MARGIN_FRAC,
          right: width * PAGE_MARGIN_FRAC,
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
