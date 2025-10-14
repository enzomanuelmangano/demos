import { type FC, memo } from 'react';

import { AntDesign } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { FLOATING_BUTTON_SIZE } from '../constants';

type AddCloseIconProps = {
  onPress: () => void;
  progress: SharedValue<number>;
};

const AddCloseIcon: FC<AddCloseIconProps> = memo(({ onPress, progress }) => {
  const rIconStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      progress.value,
      [0, 1],
      [0, Math.PI / 4],
      Extrapolation.CLAMP,
    );

    return {
      transform: [
        {
          rotate: `${rotate}rad`,
        },
      ],
    };
  }, []);

  return (
    <PressableScale
      onPress={onPress}
      style={[
        {
          position: 'absolute',
          width: FLOATING_BUTTON_SIZE,
          aspectRatio: 1,
          top: 0,
          left: 0,
          justifyContent: 'center',
          alignItems: 'center',
        },
        rIconStyle,
      ]}>
      <AntDesign name="plus" size={28} color="black" />
    </PressableScale>
  );
});

export { AddCloseIcon };
