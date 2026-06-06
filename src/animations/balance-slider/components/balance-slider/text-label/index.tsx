import { StyleSheet } from 'react-native';

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
  // The percentage animates on the UI thread through a ReText. A ReText is a
  // TextInput underneath, and a TextInput never shares an exact baseline with
  // a regular Text across RN versions — so the static label is a ReText too:
  // two identical TextInputs are level by construction.
  const percentageText = useDerivedValue(() => {
    const percentage =
      type === 'left' ? xPercentage.get() : 1 - xPercentage.get();
    return `${Math.round(percentage * 100)}%`;
  }, []);

  const labelText = useDerivedValue(() => label, [label]);

  const rContainerStyle = useAnimatedStyle(() => {
    const baseHeight = -height / 2 + 10;

    const translateY = shifted.get() ? baseHeight - height / 5 : baseHeight;
    return {
      transform: [
        {
          translateY: withSpring(translateY),
        },
      ],
    };
  }, []);

  const percentage = (
    <ReText
      text={percentageText}
      style={[
        styles.text,
        styles.percentage,
        { color: color.percentage, textAlign: type },
      ]}
    />
  );

  return (
    <Animated.View
      style={[
        {
          [type]: 8,
        },
        styles.labelContainer,
        rContainerStyle,
      ]}>
      <Animated.View style={styles.row}>
        {type === 'right' && percentage}
        <ReText
          text={labelText}
          style={[styles.text, { color: color.label }]}
        />
        {type === 'left' && percentage}
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  labelContainer: {
    alignItems: 'flex-start',
    bottom: 0,
    justifyContent: 'flex-end',
    position: 'absolute',
    zIndex: 10,
  },
  percentage: {
    // The value swings between "0%" and "100%" — pin the width so the
    // underlying TextInput never has to reflow (the ReText contract).
    marginHorizontal: 4,
    width: 44,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  text: {
    fontFamily: 'FiraCodeMedium',
    fontSize: 16,
    padding: 0,
    textTransform: 'uppercase',
  },
});
