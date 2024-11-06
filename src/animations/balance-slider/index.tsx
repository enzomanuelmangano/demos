import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BalanceSlider as BalanceSliderComponent } from './components/balance-slider';

const App = () => {
  const { width: windowWidth } = useWindowDimensions();

  return (
    <View style={styles.container}>
      <BalanceSliderComponent
        width={windowWidth * 0.9}
        height={50}
        onChange={({ leftPercentage, rightPercentage }) => {
          console.log({ leftPercentage, rightPercentage });
        }}
        leftLabel="Coffee"
        rightLabel="Milk"
        colors={{
          left: {
            box: '#44220C',
            label: '#964D20',
            percentage: '#E37C33',
          },
          right: {
            box: '#363636',
            label: '#999898',
            percentage: '#F8F8F8',
          },
        }}
        // These values are to define the limits before the slider shrinks.
        // For instance, if the leftPercentageLimitBeforeShift is 0.33, then
        // the slider will shrink when the leftPercentage reaches 0.33.
        // The same goes for the rightPercentageLimitBeforeShift.
        // The values must be between 0 and 1.
        // Honestly, the best way of doing that is to calculate automatically
        // these values by measuring the width of the labels + percentage labels
        // Example: measure('Coffee 100%').width / sliderWidth
        // But in my opinion it's not worth to do all this work
        // Since there are fixed and known labels, it's easier to just
        // hardcode the values.
        leftPercentageLimitBeforeShift={0.33}
        rightPercentageLimitBeforeShift={0.72}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const BalanceSlider = () => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <App />
    </GestureHandlerRootView>
  );
};

export { BalanceSlider };
