import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { ReText } from 'react-native-redash';

type TextLabelProps = {
  label: string;
  color: {
    label: string;
    percentage: string;
  };
  type: 'left' | 'right';
  xPercentage: SharedValue<number>;
  height: number;
  shifted: SharedValue<boolean>;
};

export const TextLabel: React.FC<TextLabelProps> = ({
  label,
  color,
  xPercentage,
  type,
  height,
  shifted,
}) => {
  const text = useDerivedValue(() => {
    const percentage =
      type === 'left' ? xPercentage.value : 1 - xPercentage.value;
    return `${Math.round(percentage * 100)}%`;
  }, []);

  const percentageLabel = useMemo(() => {
    return (
      <Animated.View>
        {/* 
          We're using the ReText component to animate the PercentageText on the UI Thread.
          There are a lot of other ways to do this, but this is the simplest.
          You can use for instance the Text from Skia or the Text from react-native-animateable-text :)
        */}
        <ReText
          text={text}
          style={[
            {
              textAlign: type,
              color: color.percentage,
              top: 2.5,
              marginHorizontal: 6,
            },
            styles.label,
          ]}
        />
      </Animated.View>
    );
  }, [color.percentage, text, type]);

  const rContainerStyle = useAnimatedStyle(() => {
    const baseHeight = -height / 2 + 10;

    const translateY = shifted.value ? baseHeight - height / 5 : baseHeight;
    return {
      transform: [
        {
          translateY: withSpring(translateY),
        },
      ],
    };
  }, []);

  return (
    <Animated.View
      style={[
        {
          // left/right: 8
          [type]: 8,
        },
        styles.labelContainer,
        rContainerStyle,
      ]}>
      <Animated.View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
        {type === 'right' && (
          <Text style={styles.labelPercentage}>{percentageLabel}</Text>
        )}
        <Text
          style={[
            {
              color: color.label,
            },
            styles.label,
          ]}>
          {label}
        </Text>
        {type === 'left' && (
          <Text style={styles.labelPercentage}>{percentageLabel}</Text>
        )}
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  labelContainer: {
    position: 'absolute',
    bottom: 0,
    zIndex: 10,
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
  },
  label: {
    fontSize: 16,
    fontFamily: 'FiraCodeMedium',
    textTransform: 'uppercase',
    height: 20,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  labelPercentage: {
    fontSize: 16,
    fontFamily: 'FiraCodeMedium',
    textTransform: 'uppercase',
    height: 20,
    marginBottom: 4,
  },
});
