import type { SkPath } from '@shopify/react-native-skia';
import {
  Canvas,
  Group,
  Path,
  Points,
  Selector,
  Text,
  useComputedValue,
} from '@shopify/react-native-skia';
import Color from 'color';
import React, { useCallback, useMemo } from 'react';

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
  const radius = useComputedValue(
    () =>
      Math.min(centerX.current, centerY.current) * 0.82 - dotStrokeWidth / 2,
    [centerX, centerY, dotStrokeWidth],
  );

  const getPolygonPath = useCallback(
    (pathValues: number[]) => {
      return getScaledPolygonPath({
        values: pathValues,
        centerX: centerX.current,
        centerY: centerY.current,
        radius: radius.current,
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

  const pathByIntensity = useComputedValue(() => {
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
  const internalPaths = useComputedValue(() => {
    return allValues.current.map(values => getPolygonPath(values));
  }, [centerX, centerY, radius, allValues]);

  const internalPoints = useComputedValue(() => {
    return allValues.current.map(values => {
      return values.map((value, index) => {
        const angle = index * ((2 * Math.PI) / values.length);
        const pointX =
          centerX.current + Math.sin(angle) * radius.current * value;
        const pointY =
          centerY.current - Math.cos(angle) * radius.current * value;
        return { x: pointX, y: pointY };
      });
    });
  }, [centerX, centerY, radius, allValues]);

  // Text Skills Positions

  const textSkills = useMemo(() => {
    return Object.keys(unwrapRef(data).current[0]?.values ?? {});
  }, [data]);

  const textSkillsPositions = useComputedValue(() => {
    return new Array(valuesLength).fill(1).map((value, index) => {
      const angle = index * ((2 * Math.PI) / valuesLength);
      const pointX = centerX.current + Math.sin(angle) * radius.current * value;
      const pointY = centerY.current - Math.cos(angle) * radius.current * value;
      return { x: pointX, y: pointY, angle };
    });
  }, [internalPoints, valuesLength, radius, centerX, centerY]);

  const transformOrigin = useComputedValue(() => {
    return {
      x: centerX.current,
      y: centerY.current,
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
          return (
            <Group key={index}>
              <Path
                key={index}
                path={
                  Selector(
                    pathByIntensity,
                    paths => paths[index],
                  ) as unknown as SkPath
                }
                style="stroke"
                color={strokeColor}
                strokeWidth={strokeWidth}
              />
            </Group>
          );
        })}
        {textSkills.map((item, index) => {
          return (
            <Group
              key={item}
              origin={transformOrigin}
              transform={Selector(textSkillsPositions, () => {
                return [
                  {
                    rotate: ((2 * Math.PI) / valuesLength) * index,
                  },
                ];
              })}>
              {font && (
                <Text
                  key={item}
                  font={font}
                  text={item}
                  color={'white'}
                  y={20}
                  x={Selector(centerX, x => x - font.getTextWidth(item) / 2)}
                />
              )}
            </Group>
          );
        })}

        {allValues.current.map((_, index) => {
          const internalPath = Selector(
            internalPaths,
            paths => paths[index],
          ) as unknown as SkPath;

          const internalPointsData = Selector(
            internalPoints,
            points => points[index],
          ) as unknown as { x: number; y: number }[];

          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const pathColor = unwrapRef(data).current[index].color;
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
