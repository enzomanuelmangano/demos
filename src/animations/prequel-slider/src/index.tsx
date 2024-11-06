import { StyleSheet, View, useWindowDimensions } from 'react-native';
import React from 'react';
import {
  interpolateColor,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { useImage } from '@shopify/react-native-skia';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DraggableSlider } from './components/draggable-slider';
import { DonutCircularProgress } from './components/donut-circular-progress';
import { ImageEditor } from './components/image-editor';
import { ButterflyWaveScrawlerGL } from './gl-transition';

const Lines = 50;
const SpacePerLine = 10;
const LineWidth = 2;

const MaxLineHeight = 12;
const MinLineHeight = 5;

const ScrollableAreHeight = MaxLineHeight * 5;

// I used a remote image from Unsplash (credits to Chris Henry https://unsplash.com/it/foto/pini-verdi-sotto-il-cielo-blu-XU7XspxKi7g)
// But I recommend you to use a local image for better performance and reliability
// I just didn't want to include a big image in the repository
const DemoImageUrl =
  'https://images.unsplash.com/photo-1596501048547-e9acb71ca798?q=80&w=3540&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D';

const App = () => {
  const progressPercentage = useSharedValue(0);

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const demoImage = useImage(DemoImageUrl);

  const { top: safeTop, bottom: safeBottom } = useSafeAreaInsets();

  const color = useDerivedValue(() => {
    // Very simple color interpolation between blue and orange
    // I really love this function from reanimated because it's so easy to use
    // And it's very powerful.
    // Few years ago I made a YouTube tutorial about it:
    // - Interpolate Colors like a pro with React Native Reanimated 2 https://youtu.be/U_V9pHnTXjA
    return interpolateColor(
      progressPercentage.value,
      [0, 1],
      ['#6d9bf1', 'orange'],
    );
  }, []);

  // There are definitely better ways of doing that :)
  const imageEditorWidth = windowWidth * 0.95;
  const imageEditorHeight = windowHeight * 0.9 - safeBottom * 3 - safeTop;

  return (
    <View style={styles.container}>
      <ImageEditor
        width={imageEditorWidth}
        height={imageEditorHeight}
        style={{
          borderRadius: 10,
          overflow: 'hidden',
          borderCurve: 'continuous',
          position: 'absolute',
          top: safeTop,
        }}
        glEffect={ButterflyWaveScrawlerGL}
        image={demoImage}
        progress={progressPercentage}
      />
      <View
        style={{
          marginTop: 35,
          alignItems: 'center',
          position: 'absolute',
          bottom: safeBottom + 40,
          height: 100,
        }}>
        <DonutCircularProgress
          size={35}
          strokeWidth={4}
          progress={progressPercentage}
          color={color}
        />
        {/* I use the Slider to get the percentage */}
        <DraggableSlider
          linesAmount={Lines}
          spacePerLine={SpacePerLine}
          maxLineHeight={MaxLineHeight}
          minLineHeight={MinLineHeight}
          bigLineIndexOffset={10}
          lineWidth={LineWidth}
          snapEach={1}
          scrollableAreaHeight={ScrollableAreHeight}
          onProgressChange={progress => {
            'worklet';
            // And then I bind the percentage to the progress of the transition
            // The progress is then passed both to the ImageEditor and the DonutCircularProgress
            progressPercentage.value = progress;
          }}
          indicatorColor={color}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export { App };
