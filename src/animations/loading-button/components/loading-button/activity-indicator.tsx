import { useEffect, useMemo } from 'react';

import {
  Canvas,
  Circle,
  Group,
  ImageSVG,
  Path,
  Skia,
  fitbox,
  rect,
  type SkSVG,
} from '@shopify/react-native-skia';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

export type ActivityStatus = 'idle' | 'loading' | 'success' | 'error';

type ActivityIndicatorProps = {
  size?: number;
  status: ActivityStatus;
  color: string;
};

const SVG_SIZE = 24;

const successSvg = Skia.SVG.MakeFromString(
  `<svg xmlns="http://www.w3.org/2000/svg" fill="white" width="24" height="24" viewBox="0 0 24 24"><path d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z"/></svg>`,
)!;

const errorSvg = Skia.SVG.MakeFromString(
  `<svg xmlns="http://www.w3.org/2000/svg" fill="white" width="24" height="24" viewBox="0 0 24 24"><path d="M12 8c-1.062 0-2.073.211-3 .587v-3.587c0-1.654 1.346-3 3-3s3 1.346 3 3v1h2v-1c0-2.761-2.238-5-5-5-2.763 0-5 2.239-5 5v4.761c-1.827 1.466-3 3.714-3 6.239 0 4.418 3.582 8 8 8s8-3.582 8-8-3.582-8-8-8zm0 10c-1.104 0-2-.896-2-2s.896-2 2-2 2 .896 2 2-.896 2-2 2z"/></svg>`,
)!;

const ActivityIndicator: React.FC<ActivityIndicatorProps> = ({
  size = 20,
  status = 'loading',
  color,
}) => {
  const rotation = useSharedValue(0);
  const strokeWidth = Math.max(2, size / 8);

  useEffect(() => {
    if (status !== 'loading') {
      cancelAnimation(rotation);
      rotation.value = 0;
      return;
    }

    rotation.value = withRepeat(
      withTiming(4 * Math.PI, {
        duration: 800,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
  }, [status, rotation]);

  const arcPath = useMemo(() => {
    const path = Skia.Path.Make();
    const inset = strokeWidth / 2;
    path.addArc(
      rect(inset, inset, size - strokeWidth, size - strokeWidth),
      0,
      90,
    );
    return path;
  }, [size, strokeWidth]);

  const transform = useDerivedValue(() => [{ rotate: rotation.value }]);
  const loadingOpacity = useDerivedValue(() =>
    withTiming(status === 'loading' ? 1 : 0, { duration: 200 }),
  );
  const iconOpacity = useDerivedValue(() =>
    withTiming(status === 'success' || status === 'error' ? 1 : 0, {
      duration: 200,
    }),
  );

  const svgIcon = useMemo(() => {
    let svg: SkSVG | null = null;
    if (status === 'success') svg = successSvg;
    if (status === 'error') svg = errorSvg;
    if (!svg) return null;

    const iconSize = size * 0.45;
    const offset = (size - iconSize) / 2;

    return (
      <Group
        transform={fitbox(
          'contain',
          rect(0, 0, SVG_SIZE, SVG_SIZE),
          rect(offset, offset, iconSize, iconSize),
        )}>
        <ImageSVG svg={svg} x={0} y={0} width={iconSize} height={iconSize} />
      </Group>
    );
  }, [size, status]);

  const containerStyle = useAnimatedStyle(() => ({
    height: withTiming(status === 'idle' ? 0 : size, { duration: 300 }),
    width: withTiming(status === 'idle' ? 0 : size, { duration: 300 }),
    marginRight: withTiming(status === 'idle' ? 0 : 6, { duration: 300 }),
    overflow: 'hidden',
  }));

  const center = size / 2;
  const radius = center - strokeWidth / 2;

  return (
    <Animated.View style={containerStyle}>
      <Canvas style={{ height: size, width: size }}>
        <Group opacity={loadingOpacity}>
          <Group origin={{ x: center, y: center }} transform={transform}>
            <Path
              path={arcPath}
              strokeWidth={strokeWidth}
              style="stroke"
              color={color}
              strokeCap="round"
            />
          </Group>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            color={color}
            opacity={0.08}
            style="stroke"
            strokeWidth={strokeWidth}
          />
        </Group>

        <Group opacity={iconOpacity}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            color={color}
            strokeWidth={strokeWidth}
          />
          {svgIcon}
        </Group>
      </Canvas>
    </Animated.View>
  );
};

export { ActivityIndicator };
