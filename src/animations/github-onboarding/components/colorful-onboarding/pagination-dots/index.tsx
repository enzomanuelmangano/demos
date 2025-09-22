import React from 'react';
import type { ViewProps } from 'react-native';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useDerivedValue } from 'react-native-reanimated';

import { PaginationDot } from './pagination-dots';

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
}: PaginationDotsProps): React.ReactElement {
  const effectiveProgress = useDerivedValue(() => {
    return reversed ? count - 1 - progress.value : progress.value;
  }, [reversed, count]);

  return (
    <View style={[styles.container, style]} {...props}>
      {Array(count)
        .fill(0)
        .map((_, index) => (
          <React.Fragment key={index}>
            <PaginationDot
              count={count}
              index={index}
              progress={effectiveProgress}
              onPress={onDotPress}
              key={index}
            />
          </React.Fragment>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
