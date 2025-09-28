import { StyleSheet, View } from 'react-native';

import { Fragment, type ReactElement } from 'react';

import { useDerivedValue } from 'react-native-reanimated';

import { PaginationDot } from './pagination-dots';

import type { ViewProps } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

export interface PaginationDotsProps extends ViewProps {
  count: number;
  progress: SharedValue<number>;
  onDotPress?: (index: number) => void;
  reversed?: boolean;
}

export function PaginationDots({
  count,
  progress,
  onDotPress,
  style,
  reversed,
  ...props
}: PaginationDotsProps): ReactElement {
  const effectiveProgress = useDerivedValue(() => {
    return reversed ? count - 1 - progress.value : progress.value;
  }, [reversed, count]);

  return (
    <View style={[styles.container, style]} {...props}>
      {Array(count)
        .fill(0)
        .map((_, index) => (
          <Fragment key={index}>
            <PaginationDot
              count={count}
              index={index}
              progress={effectiveProgress}
              onPress={onDotPress}
              key={index}
            />
          </Fragment>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
