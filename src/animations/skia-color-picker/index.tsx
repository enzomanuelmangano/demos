import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ColorPicker } from './components/color-picker';

const App = () => {
  // Using the useWindowDimensions hook to get the device's screen width,
  // which will be used as the canvas size for the ColorPicker.
  const { width: canvasSize } = useWindowDimensions();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <StatusBar style="light" />
        {/* ColorPicker component with specified properties. 
      canvasSize is determined by the width of the window (i.e., the device's screen width).
      blur is set to 20. 
      onColorUpdate is a callback that logs the color
      to the console when the color is updated. */}
        <ColorPicker
          canvasSize={canvasSize}
          blur={20}
          onColorUpdate={color => {
            console.log(color);
          }}
        />
      </View>
    </GestureHandlerRootView>
  );
};
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export { App as SkiaColorPicker };
