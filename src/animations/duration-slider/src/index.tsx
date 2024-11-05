import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useFont } from '@shopify/react-native-skia';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import sfProRoundedBold from '../../../../assets/fonts/SF-Pro-Rounded-Bold.otf';

import { CircularSlider } from './components/circular-slider';

const App = () => {
  const { width: windowWidth } = useWindowDimensions();
  const size = windowWidth * 0.8;

  const font = useFont(sfProRoundedBold, 100);

  return (
    <View style={styles.container}>
      {font && (
        <CircularSlider
          minVal={1}
          maxVal={12}
          onValueChange={value => {
            console.log({ value });
          }}
          width={size}
          height={size}
          font={font}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export { App };
