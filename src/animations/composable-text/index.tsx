import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  LinearTransition,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { PressableScale } from 'pressto';

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
      <StatusBar style="light" />
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
    flex: 1,
    backgroundColor: '#0c0c0c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  textContainer: {
    backgroundColor: '#181818',
    padding: 16,
    paddingHorizontal: 22,
    borderRadius: 32,
  },
});
