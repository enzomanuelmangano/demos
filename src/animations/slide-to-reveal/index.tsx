import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SlideToReveal } from './components/slide-to-reveal';

const App = () => {
  const { width: windowWidth } = useWindowDimensions();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <SlideToReveal code={112358} width={windowWidth * 0.6} height={80} />
      </View>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#000000',
    flex: 1,
    justifyContent: 'center',
  },
});

export { App as SlideToReveal };
