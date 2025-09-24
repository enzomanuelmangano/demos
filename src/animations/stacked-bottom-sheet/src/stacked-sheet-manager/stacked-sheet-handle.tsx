import { type FC, memo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

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
    position: 'absolute',
    top: 7.5,
    height: 2,
    width: 50,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 5,
  },
});
