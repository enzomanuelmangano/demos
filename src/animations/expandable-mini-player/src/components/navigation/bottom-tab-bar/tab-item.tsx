import { StyleSheet } from 'react-native';

import { useCallback } from 'react';

import { useNavigation } from '@react-navigation/native';
import { createAnimatedPressable } from 'pressto';
import { interpolate, withTiming } from 'react-native-reanimated';

import * as Icons from '../../../components/icons';
import { Palette } from '../../../constants/palette';

type TabItemProps = {
  icon: string;
  screen: string;
  opacity?: number;
  isActive: boolean;
};

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

const PressableScaleWithOpacity = createAnimatedPressable(
  (progress, { isSelected }) => {
    return {
      opacity: withTiming(isSelected ? 1 : 0.8),
      transform: [
        {
          scale: interpolate(progress, [0, 1], [1, 0.97]),
        },
      ],
    };
  },
);

export const TabItem = ({ icon, screen }: TabItemProps) => {
  const navigation = useNavigation();

  const onPress = useCallback(() => {
    navigation.navigate(screen as never);
  }, [screen, navigation]);

  const capitalizedIcon = capitalize(icon);
  const Icon = Icons[capitalizedIcon as keyof typeof Icons];

  return (
    <PressableScaleWithOpacity onPress={onPress} style={styles.fillCenter}>
      <Icon color={Palette.icons} />
    </PressableScaleWithOpacity>
  );
};

const styles = StyleSheet.create({
  fillCenter: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
