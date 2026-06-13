import { Platform, StyleSheet, Text, View } from 'react-native';

import { useState } from 'react';

import * as Haptics from 'expo-haptics';
import { PressableWithoutFeedback } from 'pressto';
import { useSharedValue, withSpring } from 'react-native-reanimated';

import { BackgroundGradient } from './background-gradient';
import { Paper } from './components';

const paperFoldingHaptics = async () => {
  if (Platform.OS === 'android') return;

  // Subtle light impacts to simulate paper folding
  await Haptics.selectionAsync();

  setTimeout(() => Haptics.selectionAsync(), 100);
  setTimeout(() => Haptics.selectionAsync(), 200);
};

export const PaperFolding = () => {
  const PaperWidth = 250;
  const PaperHeight = 330;

  const progress = useSharedValue(0);

  // e2e outcome probe: counts how many times the paper has folded/unfolded (the
  // fold is a Skia path driven by a shared value). Near-invisible.
  const [foldCount, setFoldCount] = useState(0);

  return (
    <View style={styles.container}>
      <Text testID="paper-folding-status" style={styles.statusProbe}>
        {`folds:${foldCount}`}
      </Text>
      <BackgroundGradient />
      <Paper width={PaperWidth} height={PaperHeight} progress={progress} />
      {/* @@TODO: wtf why is this needed? */}
      <PressableWithoutFeedback
        testID="paper-folding"
        style={styles.canvasContainer}
        globalHandlers={{}}
        onPress={() => {
          paperFoldingHaptics();
          progress.set(
            withSpring(progress.get() > 0.5 ? 0 : 1, {
              duration: 1000,
              dampingRatio: 1.5,
            }),
          );
          setFoldCount(count => count + 1);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  canvasContainer: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  // Near-invisible to the eye, but on-screen for the e2e accessibility tree.
  statusProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 1,
    color: '#808080',
    opacity: 0.012,
    zIndex: 1000,
  },
});
