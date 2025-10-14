import { StyleSheet, View } from 'react-native';

import { useState } from 'react';

import { PressableScale } from 'pressto';
import {
  LinearTransition,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { ComposableText } from './composable-text';

const Variants = {
  base: {
    color: 'rgba(255,255,255,1)',
    label: 'Use Max',
  },
  active: {
    color: 'rgba(255,255,255,0.5)',
    label: 'Using Max',
  },
};

export const ComposableTextScreen = () => {
  const [text, setText] = useState(Variants.base);

  const rTextStyle = useAnimatedStyle(() => {
    return {
      color: withTiming(text.color, { duration: 200 }),
    };
  }, [text.color]);

  return (
    <View style={styles.container}>
      <PressableScale
        layout={LinearTransition.springify()
          .mass(0.4)
          .damping(12)
          .stiffness(100)}
        onPress={() => {
          setText(prevText =>
            prevText === Variants.base ? Variants.active : Variants.base,
          );
        }}>
        <ComposableText
          containerStyle={styles.textContainer}
          text={text.label}
          style={[styles.text, rTextStyle]}
        />
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#0c0c0c',
    flex: 1,
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  textContainer: {
    backgroundColor: '#181818',
    borderCurve: 'continuous',
    borderRadius: 32,
    padding: 16,
    paddingHorizontal: 22,
  },
});
