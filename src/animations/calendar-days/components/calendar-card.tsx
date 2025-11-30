import { StyleSheet, Text, View } from 'react-native';

import { useMemo } from 'react';

import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

type CalendarCardProps = {
  day: SharedValue<number>;
  maxDay: number;
};

const CARD_WIDTH = 180;
const CARD_HEIGHT = 220;
const HEADER_HEIGHT = 50;

const CalendarCard = ({ day, maxDay }: CalendarCardProps) => {
  const digits = useMemo(() => {
    return Array.from({ length: maxDay }, (_, i) => i + 1);
  }, [maxDay]);

  const rNumbersStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: interpolate(
            day.value,
            [1, maxDay],
            [0, -(maxDay - 1) * (CARD_HEIGHT - HEADER_HEIGHT)],
          ),
        },
      ],
    };
  }, [maxDay]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.headerText}>ON THE</Text>
        </View>
        <View style={styles.body}>
          <Animated.View style={rNumbersStyle}>
            {digits.map(digit => (
              <View key={digit} style={styles.digitContainer}>
                <Text style={styles.digitText}>{digit}</Text>
              </View>
            ))}
          </Animated.View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  body: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    flex: 1,
    overflow: 'hidden',
  },
  card: {
    borderCurve: 'continuous',
    borderRadius: 20,
    elevation: 8,
    height: CARD_HEIGHT,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      height: 4,
      width: 0,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    width: CARD_WIDTH,
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitContainer: {
    alignItems: 'center',
    height: CARD_HEIGHT - HEADER_HEIGHT,
    justifyContent: 'center',
  },
  digitText: {
    color: '#000000',
    fontFamily: 'System',
    fontSize: 100,
    fontWeight: '700',
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#FF6B6B',
    height: HEADER_HEIGHT,
    justifyContent: 'center',
  },
  headerText: {
    color: '#FFFFFF',
    fontFamily: 'System',
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 2,
  },
});

export { CalendarCard, CARD_WIDTH };
