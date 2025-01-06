import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRef } from 'react';

import type { StaggeredTextRef } from './components/staggered-text';
import { StaggeredText } from './components/staggered-text';

/**
 * A debounce utility function that ensures the callback is executed only once
 * during rapid successive calls within the specified delay.
 * This implementation includes a "leading" behavior, meaning it executes
 * immediately on the first call.
 *
 * @param fn - The callback function to be debounced
 * @param delay - The delay in milliseconds before allowing another execution
 * @returns A debounced version of the callback function
 */
const debounce = (fn: () => void, delay: number) => {
  let timeout: NodeJS.Timeout;
  let isLeading = true;
  return () => {
    if (isLeading) {
      fn();
      isLeading = false;
    }
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      isLeading = true;
    }, delay);
  };
};

/**
 * Main App component that demonstrates the usage of StaggeredText animations.
 * The component renders two animated text elements that can be triggered
 * by touching the screen.
 */
const App = () => {
  // Refs to control the animation of each StaggeredText component
  const everybodyStaggeredTextRef = useRef<StaggeredTextRef>(null);
  const canCookStaggeredTextRef = useRef<StaggeredTextRef>(null);

  return (
    <View
      style={styles.container}
      onTouchStart={debounce(() => {
        // Reset and animate both text components in sequence
        // Note: If enableReverse prop is used, you can use toggleAnimate instead:
        // everybodyStaggeredTextRef.current?.toggleAnimate();
        // canCookStaggeredTextRef.current?.toggleAnimate();

        everybodyStaggeredTextRef.current?.reset();
        everybodyStaggeredTextRef.current?.animate();
        canCookStaggeredTextRef.current?.reset();
        canCookStaggeredTextRef.current?.animate();
      }, 800)}>
      <StatusBar style="light" />
      <StaggeredText
        text="Everybody"
        ref={everybodyStaggeredTextRef}
        textStyle={styles.text}
        // Optional: Enable reverse animation with enableReverse prop
        // enableReverse
      />
      <StaggeredText
        delay={300} // Delays the animation start by 300ms
        text="can cook."
        ref={canCookStaggeredTextRef}
        textStyle={styles.text}
        // Optional: Enable reverse animation with enableReverse prop
        // enableReverse
      />
    </View>
  );
};

/**
 * Styles for the App component
 */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    paddingHorizontal: 42,
    justifyContent: 'center',
  },
  text: {
    fontFamily: 'Honk-Regular', // Custom font for the animated text
  },
});

export { App as EverybodyCanCook };
