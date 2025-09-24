import {
  Canvas,
  CornerPathEffect,
  DashPathEffect,
  Line,
  Path,
  Skia,
  Text,
  useFont,
  vec,
} from '@shopify/react-native-skia';
import { type FC, memo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useDerivedValue, withSpring } from 'react-native-reanimated';

import { Palette } from '../../constants/palette';

type GraphProps = {
  scores: number[];
  canvasWidth: number;
  canvasHeight: number;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  lineScore?: number;
  maxValue?: number;
};

const Graph: FC<GraphProps> = memo(
  ({
    scores,
    canvasHeight,
    canvasWidth: width,
    style,
    padding = 0,
    lineScore = -10,
    maxValue = 100,
  }) => {
    // Calculate canvas width after considering padding
    const canvasWidth = width - padding * 2;

    // Adjust the maxValue for better visualization
    const refactoredMax = maxValue + 10;

    // Store the line score for drawing dashed line
    const dashedLineScore = lineScore;

    // Calculate the Y position of the dashed line
    const lineY = (1 - dashedLineScore / refactoredMax) * canvasHeight;

    // Create a derived value for spring animation
    const rRawScores = useDerivedValue(() => {
      return withSpring(scores);
    }, [scores]);

    // Normalize the scores for drawing the graph
    const rScores = useDerivedValue(() => {
      return rRawScores.value.map(score => score / refactoredMax);
    }, []);

    // Create a derived value for generating the graph path
    const rGraphPath = useDerivedValue(() => {
      const distance = canvasWidth / (rScores.value.length - 1);

      const path = Skia.Path.Make();

      path.moveTo(padding, (1 - rScores.value[0]) * canvasHeight);
      for (let i = 0; i < rScores.value.length; i++) {
        const score = rScores.value[i];

        path.lineTo(padding + distance * i, canvasHeight * (1 - score));
      }
      return path;
    }, [padding, rScores, scores]);

    // Load a custom font for displaying text
    const font = useFont(
      // Replace with your font import
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('../../../../../assets/fonts/SF-Compact-Rounded-Medium.otf'),
      18,
    );

    return (
      <Canvas
        style={[
          {
            width: width,
            height: canvasHeight,
          },
          style,
        ]}>
        {/* Draw a dashed line to indicate the score */}
        <Line
          p1={vec(0, lineY)}
          p2={vec(width, lineY)}
          color={'rgba(0,0,0,0.1)'}
          style="stroke"
          strokeWidth={2}>
          <DashPathEffect intervals={[4, 4]} />
        </Line>
        {font != null && (
          // Display the line score as text
          <Text
            x={width - 80}
            y={lineY + 40}
            font={font}
            color={'rgba(0,0,0,0.5)'}
            text={`${lineScore} pts`}
          />
        )}
        {/* Draw the graph path using the derived value */}
        <Path
          path={rGraphPath}
          color={Palette.primary}
          strokeWidth={3}
          style={'stroke'}
          strokeCap={'round'}>
          {/* Add a corner path effect for rounded edges */}
          <CornerPathEffect r={20} />
        </Path>
      </Canvas>
    );
  },
);

export { Graph };
