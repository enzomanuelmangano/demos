import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { useMemo, useState } from 'react';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Graph } from './components/graph';
import { SegmentedControl } from './components/segmented-control';
import {
  LIGHT_GRAPH_SCORES,
  PRO_GRAPH_SCORES,
  STANRDARD_GRAPH_SCORES,
} from './constants/graph-scores';
import { Palette } from './constants/palette';

const ScoringDifficultyData = ['Light', 'Standard', 'Pro'] as const;
type ScoringDifficultyType = (typeof ScoringDifficultyData)[number];

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
    alignItems: 'center',
    backgroundColor: Palette.background,
    flex: 1,
    justifyContent: 'center',
  },
});

const AppContainer = () => {
  return (
    <GestureHandlerRootView style={localStyles.fill}>
      <App />
    </GestureHandlerRootView>
  );
};

const localStyles = StyleSheet.create({
  fill: { flex: 1 },
});

export { AppContainer as SteddyGraphInteraction };
