import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Font from 'expo-font';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import sfCompactRoundedMedium from '../../../assets/fonts/SF-Compact-Rounded-Medium.otf'; // medium

import { SegmentedControl } from './components/segmented-control';
import { Graph } from './components/graph';
import { Palette } from './constants/palette';
import {
  LIGHT_GRAPH_SCORES,
  PRO_GRAPH_SCORES,
  STANRDARD_GRAPH_SCORES,
} from './constants/graph-scores';

// Define an array of scoring difficulties and their types
const ScoringDifficultyData = ['Light', 'Standard', 'Pro'] as const;
type ScoringDifficultyType = (typeof ScoringDifficultyData)[number];

// Map scoring difficulties to their respective score data
const ScoringMap = {
  Light: LIGHT_GRAPH_SCORES,
  Standard: STANRDARD_GRAPH_SCORES,
  Pro: PRO_GRAPH_SCORES,
};

const App = () => {
  // State to track the selected scoring difficulty
  const [scoringDifficulty, setSelectedScoringDifficulty] =
    useState<ScoringDifficultyType>('Standard');

  // Get the window width using React Native's useWindowDimensions
  const { width: windowWidth } = useWindowDimensions();

  // Calculate scores based on the selected difficulty
  const scores = useMemo(() => {
    return ScoringMap[scoringDifficulty];
  }, [scoringDifficulty]);

  return (
    <View style={styles.container}>
      {/* The status bar component */}
      <StatusBar style="auto" />

      {/* SegmentedControl component for selecting scoring difficulty */}
      <SegmentedControl
        data={ScoringDifficultyData}
        onPress={item => {
          setSelectedScoringDifficulty(item as ScoringDifficultyType);
        }}
        width={windowWidth - 30}
        height={56}
        selected={scoringDifficulty}
      />

      {/* Graph component to display the scores */}
      <Graph
        scores={scores}
        style={{ marginTop: 20 }}
        canvasHeight={200}
        canvasWidth={windowWidth}
        padding={50}
        maxValue={100}
        lineScore={70}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const AppContainer = () => {
  const [fontsLoaded, setFontsLoaded] = useState(false);

  // Load custom fonts using async Font.loadAsync
  useEffect(() => {
    (async () => {
      await Font.loadAsync({
        'SF-Compact-Rounded-Medium': sfCompactRoundedMedium, // medium
      });
      setFontsLoaded(true);
    })();
  }, []);

  return (
    // Because we're using the PressableScale :) (based on a GestureDetector)
    <GestureHandlerRootView style={localStyles.fill}>
      {fontsLoaded && <App />}
    </GestureHandlerRootView>
  );
};

const localStyles = StyleSheet.create({
  fill: { flex: 1 },
});

export { AppContainer as SteddyGraphInteraction };
