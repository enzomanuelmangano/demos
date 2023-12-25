import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { Dot, DotProps } from './Dot';

type DotsProps = Pick<DotProps, 'activeDots'> & {
  contentContainerStyle?: StyleProp<ViewStyle>;
  amount?: number;
};

const Dots: React.FC<DotsProps> = React.memo(
  ({ contentContainerStyle, activeDots, amount = 5 }) => {
    return (
      <View style={contentContainerStyle}>
        {new Array(amount).fill(0).map((_, index) => {
          return <Dot index={index} activeDots={activeDots} key={index} />;
        })}
      </View>
    );
  }
);

export { Dots };
