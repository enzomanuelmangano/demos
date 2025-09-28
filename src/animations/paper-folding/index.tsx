import { StyleSheet, View } from 'react-native';

import { useSharedValue, withTiming } from 'react-native-reanimated';

import { BackgroundGradient } from './background-gradient';
import { Paper } from './components';

export const PaperFolding = () => {
  const PaperWidth = 250;
  const PaperHeight = 330;

  const progress = useSharedValue(0);

  return (
    <View style={styles.container}>
      <BackgroundGradient />
      <Paper width={PaperWidth} height={PaperHeight} progress={progress} />
      {/* @@TODO: wtf why is this needed? */}
      <View
        style={styles.canvasContainer}
        onTouchEnd={() => {
          progress.value = withTiming(progress.value > 0 ? 0 : 1, {
            duration: 800,
          });
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
});
