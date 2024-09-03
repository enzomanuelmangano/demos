import { View } from 'react-native';
import { format } from 'date-fns';

import { Bar } from './single-bar';

type DayInfo = {
  day: Date;
  value: number;
};

type WeekData = DayInfo[];

type WeeklyChartProps = {
  data: WeekData;
  width: number;
  height: number;
};

export const WeeklyChart: React.FC<WeeklyChartProps> = ({
  width,
  height,
  data,
}) => {
  const internalPaddingHorizontal = 48;
  const gap = 20;

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
      {data.map(({ value }, index) => {
        // Calculate the width for each bar in the chart
        // Pretty odd calculation, but I think it makes sense for this specific layout
        // Basically, we're dividing the width of the chart by 7 (7 days in a week)
        // Then we subtract the padding on the left and right of the chart
        // And we subtract the gap between each bar (6 gaps for 7 bars)
        const barWidth = (width - internalPaddingHorizontal * 2 - gap * 6) / 7;

        // Format the day from the data to get a single letter representing the day of the week
        const weeklyDayLetter = format(data[index].day, 'eeeee').toLowerCase();

        return (
          <Bar
            key={index} // Unique key for each bar component for efficient rendering
            letter={weeklyDayLetter} // Single letter representing the day of the week
            maxHeight={height} // Maximum height of the bar
            minHeight={height / 5} // Minimum height of the bar
            width={barWidth} // Calculated width of the bar
            progress={value} // Progress value determining the height of the bar
          />
        );
      })}
    </View>
  );
};
