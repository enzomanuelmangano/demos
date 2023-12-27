import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { AnimatedCount } from './components/animated-count';
import { AnimatedSlider } from './components/animated-slider';
import { Palette } from './constants';

const CURRENCY = '$';

const App = () => {
  const price = useSharedValue(0);

  const maxValue = 4500;
  const textDigitWidth = 19;
  const textDigitHeight = 36;
  const maxDigits = maxValue.toString().length;
  const fontSize = 30;

  const { width: windowWidth } = useWindowDimensions();

  const rCurrencyStyle = useAnimatedStyle(() => {
    // Calculate the number of digits in the price.
    const digitCount = price.value.toString().length;
    // Calculate the number of missing digits.
    // For instance, if the maxDigits is 5 and the count is 123, then the missing digits are 2.
    const missingDigits = maxDigits - digitCount;

    return {
      transform: [
        {
          // Adjust the position of the currency symbol based on the number of digits.
          translateX: withSpring(
            (missingDigits * textDigitWidth) / 2 - textDigitWidth - 2.5,
          ),
        },
      ],
    };
  }, []);

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />

      <View
        style={{
          flexDirection: 'row',
          overflow: 'visible',
          marginBottom: 50,
        }}>
        <Animated.View style={[{ position: 'absolute' }, rCurrencyStyle]}>
          <Text
            style={{
              fontSize: fontSize,
              fontWeight: 'bold',
              color: Palette.primary,
            }}>
            {CURRENCY}
          </Text>
        </Animated.View>
        <AnimatedCount
          count={price}
          maxDigits={maxDigits}
          textDigitWidth={textDigitWidth}
          textDigitHeight={textDigitHeight}
          fontSize={fontSize}
          color={Palette.primary}
        />
      </View>

      <AnimatedSlider
        initialProgress={price.value}
        style={{
          width: windowWidth - 90,
        }}
        minValue={0}
        maxValue={maxValue}
        onUpdate={prog => {
          price.value = Math.round(prog);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export { App as AirbnbSlider };
