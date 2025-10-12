import { StyleSheet, View } from 'react-native';

import { useRef } from 'react';

import { PressableWithoutFeedback } from 'pressto';

import { StaggeredText } from './components/staggered-text';

import type { StaggeredTextRef } from './components/staggered-text';

const App = () => {
  // Refs to control the animation of each StaggeredText component
  const everybodyStaggeredTextRef = useRef<StaggeredTextRef>(null);
  const canCookStaggeredTextRef = useRef<StaggeredTextRef>(null);

  return (
    <View style={styles.fill}>
      <PressableWithoutFeedback
        style={styles.container}
        onPress={() => {
          // Reset and animate both text components in sequence
          // Note: If enableReverse prop is used, you can use toggleAnimate instead:
          // everybodyStaggeredTextRef.current?.toggleAnimate();
          // canCookStaggeredTextRef.current?.toggleAnimate();

          everybodyStaggeredTextRef.current?.reset();
          everybodyStaggeredTextRef.current?.animate();
          canCookStaggeredTextRef.current?.reset();
          canCookStaggeredTextRef.current?.animate();
        }}>
        <StaggeredText
          text="Everybody"
          ref={everybodyStaggeredTextRef}
          textStyle={styles.text}
          // Optional: Enable reverse animation with enableReverse prop
          // enableReverse
        />
        <StaggeredText
          delay={280} // Delays the animation
          text="can cook."
          ref={canCookStaggeredTextRef}
          textStyle={styles.text}
          // Optional: Enable reverse animation with enableReverse prop
          // enableReverse
        />
      </PressableWithoutFeedback>
    </View>
  );
};

/**
 * Styles for the App component
 */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 42,
  },
  fill: {
    backgroundColor: '#000',
    flex: 1,
  },
  text: {
    fontFamily: 'Honk-Regular', // Custom font for the animated text
  },
});

export { App as EverybodyCanCook };
