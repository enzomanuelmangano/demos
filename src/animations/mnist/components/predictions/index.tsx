import { StyleSheet, Text, View } from 'react-native';

import Animated, { useDerivedValue, withTiming } from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

const Square = ({
  progress,
  isActive,
  size,
}: {
  progress: SharedValue<number>;
  isActive: SharedValue<boolean>;
  size: number;
}) => {
  const rColor = useDerivedValue(() => {
    return withTiming(isActive.value ? '#5cd1ff' : 'white');
  });

  return (
    <Animated.View style={[styles.square, { height: size, width: size }]}>
      <Animated.View
        style={[
          styles.squareInner,
          { opacity: progress, backgroundColor: rColor },
        ]}
      />
    </Animated.View>
  );
};

const PredictionItem = ({
  index,
  finalOutput,
}: {
  index: number;
  finalOutput: SharedValue<number[]>;
}) => {
  const progress = useDerivedValue(() => finalOutput.value[index]);
  const isActive = useDerivedValue(() => {
    return (
      finalOutput.value.findIndex((val, idx) => val > 0.5 && idx === index) !==
      -1
    );
  });

  return (
    <View style={styles.predictionItem}>
      <Text style={{ color: '#d2d2d2' }}>{index === 10 ? 'N/A' : index}</Text>
      <Square progress={progress} isActive={isActive} size={20} />
    </View>
  );
};

export const Predictions = ({
  finalOutput,
}: {
  finalOutput: SharedValue<number[]>;
}) => {
  return (
    <View style={styles.predictionsContainer}>
      {finalOutput.value.map((_, i) => (
        <PredictionItem key={i} index={i} finalOutput={finalOutput} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  predictionItem: {
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center',
  },
  predictionsContainer: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  square: {
    borderColor: 'white',
    borderCurve: 'continuous',
    borderRadius: 40,
    borderWidth: 1,
    padding: 2,
  },
  squareInner: {
    borderCurve: 'continuous',
    borderRadius: 30,
    flex: 1,
  },
});
