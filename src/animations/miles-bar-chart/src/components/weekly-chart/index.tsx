import { View } from 'react-native';

import { useMemo } from 'react';

import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { Bar } from './single-bar';

type DayInfo = {
  day: string;
  weekIndex: number;
  dayIndex: number;
  value: number;
  dateString: string;
};

type WeekData = DayInfo[];

type WeeklyChartProps = {
  data: SharedValue<WeekData>;
  width: number;
  height: number;
};

type AnimatedWeeklyBarProps = {
  data: SharedValue<WeekData>;
  width: number;
  height: number;
  index: number;
  internalPaddingHorizontal: number;
  gap: number;
};

const AnimatedWeeklyBar = ({
  data,
  width,
  height,
  index,
  internalPaddingHorizontal,
  gap,
}: AnimatedWeeklyBarProps) => {
  const barWidth = (width - internalPaddingHorizontal * 2 - gap * 6) / 7;

  const letter = useMemo(() => {
    return data.value[index].day;
  }, [data, index]);

  const progress = useDerivedValue(() => {
    return data.value[index].value;
  }, [data, index]);

  return (
    <Bar
      key={index}
      letter={letter}
      maxHeight={height}
      minHeight={height / 5}
      width={barWidth}
      progress={progress}
    />
  );
};

export const WeeklyChart: React.FC<WeeklyChartProps> = ({
  width,
  height,
  data,
}) => {
  const internalPaddingHorizontal = 48;
  const gap = 20;
  const initialData = useMemo(() => data.value, [data]);

  return (
    <View
      style={{
        width,
        height,
        paddingHorizontal: internalPaddingHorizontal,
        gap,
        flexDirection: 'row',
        alignItems: 'flex-end',
      }}>
      {initialData.map((_, index) => {
        // Calculate the width for each bar in the chart
        // Pretty odd calculation, but I think it makes sense for this specific layout
        // Basically, we're dividing the width of the chart by 7 (7 days in a week)
        // Then we subtract the padding on the left and right of the chart
        // And we subtract the gap between each bar (6 gaps for 7 bars)
        return (
          <AnimatedWeeklyBar
            key={index}
            data={data}
            width={width}
            height={height}
            index={index}
            internalPaddingHorizontal={internalPaddingHorizontal}
            gap={gap}
          />
        );
      })}
    </View>
  );
};
