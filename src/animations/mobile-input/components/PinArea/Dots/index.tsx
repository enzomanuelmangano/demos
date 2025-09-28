import { View } from 'react-native';

import { type FC, memo } from 'react';

import { Dot } from './Dot';

import type { DotProps } from './Dot';
import type { StyleProp, ViewStyle } from 'react-native';

type DotsProps = Pick<DotProps, 'activeDots'> & {
  contentContainerStyle?: StyleProp<ViewStyle>;
  amount?: number;
};

const Dots: FC<DotsProps> = memo(
  ({ contentContainerStyle, activeDots, amount = 5 }) => {
    return (
      <View style={contentContainerStyle}>
        {new Array(amount).fill(0).map((_, index) => {
          return <Dot index={index} activeDots={activeDots} key={index} />;
        })}
      </View>
    );
  },
);

export { Dots };
