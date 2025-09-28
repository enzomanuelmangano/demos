import { StyleSheet } from 'react-native';

import { useCallback } from 'react';

import { useNavigation } from '@react-navigation/native';
import { PressableScale } from 'pressto';
import {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

import * as Icons from '../../../components/icons';
import { Palette } from '../../../constants/palette';

type TabItemProps = {
  icon: string;
  screen: string;
  opacity?: number;
  isActive?: boolean;
};

const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

export const TabItem = ({
  icon,
  screen,
  opacity = 1,
  isActive: isScreenActive,
}: TabItemProps) => {
  const navigation = useNavigation();

  const onPress = useCallback(() => {
    if (screen === 'back') {
      // in a real use case -> goBack()
      return navigation.navigate('home' as never);
    }
    navigation.navigate(screen as never);
  }, [screen, navigation]);

  const capitalizedIcon = capitalize(icon);
  const Icon = Icons[capitalizedIcon as keyof typeof Icons];

  const isActive = useDerivedValue(() => {
    if (screen === 'note') {
      return false;
    }
    return isScreenActive;
  }, [isScreenActive]);

  const rStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(isActive.value ? 0.8 * opacity : 0.2 * opacity),
    };
  }, [opacity]);

  return (
    <PressableScale onPress={onPress} style={[styles.fillCenter, rStyle]}>
      <Icon color={Palette.icons} />
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  fillCenter: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
