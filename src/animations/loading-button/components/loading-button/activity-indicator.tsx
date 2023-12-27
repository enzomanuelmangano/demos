import {
  Canvas,
  Circle,
  Group,
  ImageSVG,
  Path,
  Skia,
  fitbox,
  rect,
} from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
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

// Icons from:  https://iconmonstr.com
const svgSize = 24;

const DoneSvg = Skia.SVG.MakeFromString(
  `<svg xmlns="http://www.w3.org/2000/svg" fill="white" width="24" height="24" viewBox="0 0 24 24"><path d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z"/></svg>`,
)!;
const ErrorSvg = Skia.SVG.MakeFromString(
  `<svg xmlns="http://www.w3.org/2000/svg" fill="white" width="24" height="24" viewBox="0 0 24 24"><path d="M12 8c-1.062 0-2.073.211-3 .587v-3.587c0-1.654 1.346-3 3-3s3 1.346 3 3v1h2v-1c0-2.761-2.238-5-5-5-2.763 0-5 2.239-5 5v4.761c-1.827 1.466-3 3.714-3 6.239 0 4.418 3.582 8 8 8s8-3.582 8-8-3.582-8-8-8zm0 10c-1.104 0-2-.896-2-2s.896-2 2-2 2 .896 2 2-.896 2-2 2z"/></svg>`,
)!;

// First of all... Why is this component so complicated?
//
// The reason is that we want to achieve a very particular animation for the loading indicator.
// We don't want the default circular loading indicator from React Native but instead we want to
// animate the arc by following a specific easing curve. This is not possible with the default!
// The curve is the following: https://cubic-bezier.com/#.35,.7,.29,.32 (This website is pure gold!)

// The best way to achieve this is to use the react-native-skia package (IMHO).

// Since I've implemented the arc animation with Skia, to keep the animations smooth, I've decided
// to handle also the other states (success, error and idle) with Skia. (This is not strictly necessary)

// To handle everything the trick is too coordinate the opacity of the different groups of elements:
// - The loading group (arc + circle)
// - The success/error group (circle + svg icon)
// - The idle group (nothing)

const useLoadingArcProgress = (status: ActivityStatus) => {
  const loadingArcProgress = useSharedValue(0);

  useEffect(() => {
    if (status !== 'loading') {
      // Reset the animation
      cancelAnimation(loadingArcProgress);
      loadingArcProgress.value = 0;
      return;
    }
    loadingArcProgress.value = withRepeat(
      withTiming(6 * Math.PI, {
        duration: 2100,
        easing: Easing.bezier(0.35, 0.7, 0.29, 0.32),
      }),
      -1,
      false,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return loadingArcProgress;
};

// Our ActivityIndicator component is responsible for visually indicating activity to the user.
// It supports multiple statuses like loading, success, error, and idle.
const ActivityIndicator: React.FC<ActivityIndicatorProps> = ({
  size = 30, // Default size of the activity indicator
  status = 'loading', // Default status is loading
  color, // Color of the activity indicator
}) => {
  // Stroke width for our designs, constant across different parts
  const internalStrokeWidth = 4;

  // This keeps track of the loading arc's progress value.
  // The loadingArcProgress increases with time and resets depending on the status
  const loadingArcProgress = useLoadingArcProgress(status);

  // This memoized value provides the path for the arc.
  // The arc is drawn using the Skia Path API.
  // The arc is drawn inside a square of size `size` with a stroke width of `internalStrokeWidth`.
  const arcPath = useMemo(() => {
    const path = Skia.Path.Make();
    path.addArc(
      rect(
        internalStrokeWidth / 2,
        internalStrokeWidth / 2,
        size - internalStrokeWidth,
        size - internalStrokeWidth,
      ),
      0,
      90,
    );
    return path;
  }, [internalStrokeWidth, size]);

  // Compute the transformation for the arc, specifically the rotation. This is derived from
  // the current loadingArcProgress value to give the loading animation effect.
  const arcTransform = useDerivedValue(() => {
    return [{ rotate: loadingArcProgress.value }];
  });

  // Determines the opacity of the loading group depending on the status.
  // Opacity 1 if loading, else 0.
  const loadingGroupOpacity = useDerivedValue(() => {
    return withTiming(status === 'loading' ? 1 : 0);
  }, [status]);

  // Determines the opacity of the success or error group depending on the status.
  // Opacity 1 if success or error, else 0.
  const successOrErrorGroupOpacity = useDerivedValue(() => {
    return withTiming(status === 'success' || status === 'error' ? 1 : 0);
  }, [status]);

  // A simple map to get the corresponding SVGs based on the status.
  const svgMap = useMemo(() => {
    return {
      success: DoneSvg,
      error: ErrorSvg,
    };
  }, []);

  // This memoized value provides the SVG for success or error states.
  // Depending on the current status, it chooses the correct SVG from the svgMap and calculates
  // positioning and dimensions.
  const successOrErrorSvg = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svg = (svgMap as any)[status];

    const src = rect(0, 0, svgSize, svgSize);
    const iconSize = size * 0.5;

    const offset = (size - iconSize) / 2;

    const dst = rect(offset, offset, iconSize, iconSize);

    return (
      <Group transform={fitbox('contain', src, dst)}>
        <ImageSVG svg={svg} x={0} y={0} width={iconSize} height={iconSize} />
      </Group>
    );
  }, [size, status, svgMap]);

  // Animated style for the main container. Its dimensions change based on the status.
  // If the status is 'idle', then it doesn't take up any space.
  const rContainerStyle = useAnimatedStyle(() => {
    const dimension = withTiming(status === 'idle' ? 0 : size);

    return {
      height: dimension,
      width: dimension,
      marginRight: 10,
    };
  }, [status, size]);

  // Finally, the render. Depending on various values and styles computed above, we return the
  // component visuals.
  return (
    <Animated.View style={rContainerStyle}>
      <Canvas
        style={{
          height: size,
          aspectRatio: 1,
          borderRadius: size / 2,
        }}>
        <Group opacity={loadingGroupOpacity}>
          <Group
            origin={{
              x: size / 2,
              y: size / 2,
            }}
            transform={arcTransform}>
            <Path
              path={arcPath}
              strokeWidth={internalStrokeWidth}
              style={'stroke'}
              color={color}
              strokeCap={'round'}
            />
          </Group>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - internalStrokeWidth / 2}
            color={color}
            opacity={0.1}
            style="stroke"
            strokeWidth={internalStrokeWidth}
          />
        </Group>
        <Group opacity={successOrErrorGroupOpacity}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2 - internalStrokeWidth / 2}
            color={color}
            strokeWidth={internalStrokeWidth}
          />
          {successOrErrorSvg}
        </Group>
      </Canvas>
    </Animated.View>
  );
};

export { ActivityIndicator };
