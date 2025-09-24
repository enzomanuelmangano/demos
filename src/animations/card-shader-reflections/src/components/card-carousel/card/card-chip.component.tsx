import { type FC } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import Animated, { type AnimatedStyle } from 'react-native-reanimated';

import { styles } from './card-chip.styles';

type CardChipProps = {
  chipAnimatedStyle: StyleProp<AnimatedStyle<ViewStyle>>;
};

export const CardChip: FC<CardChipProps> = ({ chipAnimatedStyle }) => {
  return (
    <Animated.View style={[styles.chipContainer, chipAnimatedStyle]}>
      <View style={styles.chip}>
        <View style={styles.chipGrid}>
          <View style={styles.chipRow}>
            <View style={[styles.chipContact, styles.chipContactSmall]} />
            <View style={[styles.chipContact, styles.chipContactLarge]} />
          </View>
          <View style={styles.chipRow}>
            <View style={[styles.chipContact, styles.chipContactLarge]} />
            <View style={[styles.chipContact, styles.chipContactSmall]} />
          </View>
          <View style={styles.chipRow}>
            <View style={[styles.chipContact, styles.chipContactSmall]} />
            <View style={[styles.chipContact, styles.chipContactLarge]} />
          </View>
        </View>
      </View>
    </Animated.View>
  );
};
