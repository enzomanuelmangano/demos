import { Canvas, Group, Path, Points, Text } from '@shopify/react-native-skia';
import Color from 'color';
import React, { useCallback, useMemo } from 'react';
import { useDerivedValue } from 'react-native-reanimated';

import { useCanvasLayout } from './hooks/use-canvas-layout';
import { getScaledPolygonPath } from './utils/get-scaled-polygon';
import { unwrapRef } from './utils/unwrap-ref';
import type { RadarChartProps } from './typings';
import { useUnwrappedValues } from './hooks/use-unwrapped-radar-values';
import { usePolygonGrid } from './hooks/use-polygon-grid';

function RadarChart<K extends string>({
  data,
  strokeWidth = 1,
  internalLayers = 4,
  showGrid = true,
  strokeColor = 'white',
  font,
  style,
}: RadarChartProps<K>) {
  const { size, centerX, centerY } = useCanvasLayout(style);

  const dotStrokeWidth = strokeWidth * 4;
  const radius = useDerivedValue(
    () => Math.min(centerX.value, centerY.value) * 0.82 - dotStrokeWidth / 2,
    [centerX, centerY, dotStrokeWidth],
  );

  const getPolygonPath = useCallback(
    (pathValues: number[]) => {
      'worklet';
      return getScaledPolygonPath({
        values: pathValues,
        centerX: centerX.value,
        centerY: centerY.value,
        radius: radius.value,
      });
    },
    [centerX, centerY, radius],
  );

  const { allValues, valuesLength } = useUnwrappedValues({ data });

  // Layers
  const layerIntensities = useMemo(() => {
    if (internalLayers === 0) {
      return [];
    }
    return new Array(internalLayers).fill(1).map((_, index) => {
      return 1 - index / internalLayers;
    });
  }, [internalLayers]);

  const pathByIntensity = useDerivedValue(() => {
    return layerIntensities.map(intensity => {
      const pathValues = new Array(valuesLength).fill(intensity);
      return getPolygonPath(pathValues);
    });
  }, [centerX, centerY, radius, valuesLength, layerIntensities]);
  //

  const { internalConnectedLinesFromCenter } = usePolygonGrid({
    radius,
    centerX,
    centerY,
    n: valuesLength,
  });

  // Radar Paths
  const internalPaths = useDerivedValue(() => {
    return allValues.value.map(values => getPolygonPath(values));
  }, [centerX, centerY, radius, allValues]);

  const internalPoints = useDerivedValue(() => {
    return allValues.value.map(values => {
      return values.map((value, index) => {
        const angle = index * ((2 * Math.PI) / values.length);
        const pointX = centerX.value + Math.sin(angle) * radius.value * value;
        const pointY = centerY.value - Math.cos(angle) * radius.value * value;
        return { x: pointX, y: pointY };
      });
    });
  }, [centerX, centerY, radius, allValues]);

  // Text Skills Positions

  const textSkills = useMemo(() => {
    return Object.keys(unwrapRef(data).value[0]?.values ?? {});
  }, [data]);

  const transformOrigin = useDerivedValue(() => {
    return {
      x: centerX.value,
      y: centerY.value,
    };
  }, [centerX, centerY]);

  return (
    <Canvas onSize={size} style={style}>
      <>
        {showGrid && (
          <Path
            path={internalConnectedLinesFromCenter}
            color={strokeColor}
            style={'stroke'}
            strokeWidth={strokeWidth}
          />
        )}
        {layerIntensities.map((_, index) => {
          // eslint-disable-next-line react-hooks/rules-of-hooks
          const path = useDerivedValue(() => {
            return pathByIntensity.value[index];
          }, [pathByIntensity, index]);

          return (
            <Group key={index}>
              <Path
                key={index}
                path={path}
                style="stroke"
                color={strokeColor}
                strokeWidth={strokeWidth}
              />
            </Group>
          );
        })}
        {textSkills.map((item, index) => {
          // eslint-disable-next-line react-hooks/rules-of-hooks
          const x = useDerivedValue(() => {
            if (!font) {
              return 0;
            }
            return centerX.value - font.getTextWidth(item) / 2;
          }, [centerX, font]);
          return (
            <Group
              key={item}
              origin={transformOrigin}
              transform={[
                {
                  rotate: ((2 * Math.PI) / valuesLength) * index,
                },
              ]}>
              {font && (
                <Text
                  key={item}
                  font={font}
                  text={item}
                  color={'white'}
                  y={20}
                  x={x}
                />
              )}
            </Group>
          );
        })}

        {allValues.value.map((_, index) => {
          // eslint-disable-next-line react-hooks/rules-of-hooks
          const internalPath = useDerivedValue(() => {
            return internalPaths.value[index];
          }, [internalPaths, index]);

          // eslint-disable-next-line react-hooks/rules-of-hooks
          const internalPointsData = useDerivedValue(() => {
            return internalPoints.value[index];
          }, [internalPoints, index]);

          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const pathColor = unwrapRef(data).value[index].color;
          const pathStrokeColor = Color(pathColor).darken(0.1).hex();

          return (
            <Group key={index}>
              <Path path={internalPath} color={pathColor} style={'fill'} />
              <Points
                points={internalPointsData}
                color={pathStrokeColor}
                style={'fill'}
                strokeWidth={dotStrokeWidth}
                strokeCap={'round'}
              />
              <Path
                key={index}
                path={internalPath}
                style="stroke"
                color={pathStrokeColor}
                strokeWidth={strokeWidth * 2}
              />
            </Group>
          );
        })}
      </>
    </Canvas>
  );
}

export { RadarChart };
export * from './typings';
export * from './use-radar-value';
