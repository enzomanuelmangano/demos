import { StyleSheet, View } from 'react-native';

import { AntDesign } from '@expo/vector-icons'; // Icons from Expo's vector icons library
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SplitButton } from './components/split-button';
import { colors } from './constants';

const SplitButtonContainer = () => {
  return (
    // The GestureHandlerRootView is crucial when you're using the
    // react-native-gesture-handler library to handle touch gestures and interactions.
    // It provides a more optimized and performant way to manage gestures,
    // making interactions smoother and more responsive.
    // Without GestureHandlerRootView, some gesture interactions might
    // not work as expected or could lead to performance issues.
    // It's essentially a wrapper component that ensures proper
    // gesture handling throughout the app.
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Main container */}
      <View style={styles.container}>
        <SplitButton
          rightIcon={
            <AntDesign name="apple" size={21} color={colors.background} />
          }
          leftIcon={
            <AntDesign name="google" size={22} color={colors.almostBlack} />
          }
        />
      </View>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});

export { SplitButtonContainer as SplitButton };
