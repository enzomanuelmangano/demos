import { StyleSheet, Text, View } from 'react-native';

import { useNavigation } from '@react-navigation/native';
import { createAnimatedPressable } from 'pressto';
import {
  interpolate,
  interpolateColor,
  useAnimatedReaction,
} from 'react-native-reanimated';
import { useReanimatedTransitionProgress } from 'react-native-screens/reanimated';

import { Screen } from '../../../../components/navigation';
import { SharedTransitionProgress } from '../../../../navigation/custom/shared-progress';

// This is my new package: pressto :)
// Finally I created a package for touchables :)
const PressableHighlight = createAnimatedPressable(progress => {
  'worklet';
  return {
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ['rgba(255,255,255,0)', 'rgba(255,255,255,0.1)'],
    ),
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 0.98]) }],
  };
});

export function Home() {
  const navigation = useNavigation();

  const { progress, goingForward } = useReanimatedTransitionProgress();

  useAnimatedReaction(
    () => progress.value,
    value => {
      SharedTransitionProgress.value = goingForward.value ? value : 1 - value;
    },
    [],
  );

  return (
    <Screen title="Home">
      <View style={{ flex: 5 }} />
      <PressableHighlight
        style={styles.pressableHighlight}
        onPress={() => {
          navigation.navigate('issues' as never);
        }}>
        <Text style={styles.text}>My issues</Text>
      </PressableHighlight>
      <View style={{ flex: 1 }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pressableHighlight: {
    alignItems: 'center',
    borderRadius: 10,
    height: 50,
    justifyContent: 'center',
    width: 100,
  },
  text: {
    color: 'white',
  },
});
