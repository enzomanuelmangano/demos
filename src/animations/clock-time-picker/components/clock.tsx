/**
 * Clock Component
 *
 * A custom analog clock implementation using Skia for high-performance graphics rendering.
 * Features smooth hand movements, custom tick marks, and shadow effects.
 *
 * @component
 * @example
 * ```tsx
 * <Clock date={sharedDateValue} size={100} />
 * ```
 */

import {
  Canvas,
  Circle,
  Group,
  Line,
  Shadow,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

/**
 * Props for the Clock component
 * @property {SharedValue<number>} date - Shared value containing the current timestamp in milliseconds
 * @property {number} size - Size of the clock in pixels (width and height)
 */
type ClockProps = {
  date: SharedValue<number>;
  size: number;
};

/**
 * Converts milliseconds to minutes
 * @param {number} ms - Milliseconds to convert
 * @returns {number} Minutes
 */
const convertMsToMinutes = (ms: number) => {
  'worklet';
  return ms / 1000 / 60;
};

/**
 * Converts milliseconds to hours
 * @param {number} ms - Milliseconds to convert
 * @returns {number} Hours
 */
const convertMsToHours = (ms: number) => {
  'worklet';
  return ms / 1000 / 60 / 60;
};

export const Clock = ({ date, size }: ClockProps) => {
  const ticks = useMemo(() => {
    return new Array(12).fill(0).map((_, index) => {
      return {
        angle: (index * (Math.PI * 2)) / 12,
      };
    });
  }, []);

  // Calculate clock dimensions
  const center = size / 2;
  const tickLength = size * 0.08; // Length of each tick mark
  const tickWidth = 1; // Width of each tick mark

  // Generate tick marks using Skia
  const ticksPath = useMemo(() => {
    return (
      <Group origin={{ x: center, y: center }} transform={[{ scale: 0.9 }]}>
        {ticks.map((tick, index) => {
          // Calculate start and end points for each tick mark
          const startX = center + (center - tickLength) * Math.sin(tick.angle);
          const startY = center - (center - tickLength) * Math.cos(tick.angle);
          const endX = center + center * Math.sin(tick.angle);
          const endY = center - center * Math.cos(tick.angle);

          return (
            <Line
              key={index}
              p1={{ x: startX, y: startY }}
              p2={{ x: endX, y: endY }}
              color="#bfbfbf"
              strokeWidth={tickWidth}
            />
          );
        })}
      </Group>
    );
  }, [center, tickLength, ticks]);

  const hourAngle = useDerivedValue(() => {
    const hours = convertMsToHours(date.value);
    return (hours * (Math.PI * 2)) / 12;
  }, []);

  const minuteAngle = useDerivedValue(() => {
    const minutes = convertMsToMinutes(date.value);
    return (minutes * (Math.PI * 2)) / 60;
  }, [date]);

  const hourHandLength = size * 0.15;
  const minuteHandLength = size * 0.32;

  const hourHandPath = useDerivedValue(() => {
    return {
      x: center + hourHandLength * Math.sin(hourAngle.value),
      y: center - hourHandLength * Math.cos(hourAngle.value),
    };
  }, [hourAngle]);

  const minuteHandPath = useDerivedValue(() => {
    return {
      x: center + minuteHandLength * Math.sin(minuteAngle.value),
      y: center - minuteHandLength * Math.cos(minuteAngle.value),
    };
  }, [minuteAngle]);

  return (
    <Canvas style={{ height: size, width: size }}>
      {/* Clock face background */}
      <Circle cx={center} cy={center} r={center} color="#1e1e1e" />
      {ticksPath}

      <Group>
        {/* Hour hand with shadow */}
        <Line
          p1={{ x: center, y: center }}
          p2={hourHandPath}
          color="#e6e6e6"
          strokeWidth={3}
          strokeCap="round"
          strokeJoin="round"
        />

        {/* Minute hand with shadow */}
        <Line
          p1={{ x: center, y: center }}
          p2={minuteHandPath}
          color="#d2d2d2"
          strokeWidth={2}
          strokeCap="round"
          strokeJoin="round"
        />

        {/* Center dot with shadow */}
        <Group>
          <Circle cx={center} cy={center} r={3} color="#ffffff" />
          <Shadow dx={0} dy={0} blur={10} color="#000000" />
        </Group>
        <Shadow dx={0} dy={0} blur={10} color="#000000" />
      </Group>
    </Canvas>
  );
};
