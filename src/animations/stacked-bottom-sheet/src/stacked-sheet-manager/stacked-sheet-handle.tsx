import { StyleSheet, View } from 'react-native';

import { type FC, memo } from 'react';

import type { StyleProp, ViewStyle } from 'react-native';

type StackedSheetHandleProps = {
  style?: StyleProp<ViewStyle>;
};

export const StackedSheetHandle: FC<StackedSheetHandleProps> = memo(
  ({ style }) => {
    return <View style={[styles.handle, style]} />;
  },
);

const styles = StyleSheet.create({
  handle: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 5,
    height: 2,
    position: 'absolute',
    top: 7.5,
    width: 50,
  },
});
