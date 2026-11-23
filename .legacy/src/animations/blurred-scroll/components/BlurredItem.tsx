import Animated, {
  SharedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import {
  Blur,
  Canvas,
  Extrapolate,
  Fill,
  Group,
  LinearGradient,
  Paint,
  RoundedRect,
  interpolate,
} from 'react-native-skia';

type BlurredItemProps = {
  index: number;
  height: number;
  width: number;
  horizontalPadding?: number;
  verticalPadding?: number;
  contentOffsetY: SharedValue<number>;
};

const BlurredItem: React.FC<BlurredItemProps> = ({
  index,
  horizontalPadding = 120,
  verticalPadding = 120,
  width,
  height: blurredItemContainerHeight,
  contentOffsetY,
}) => {
  const inputRange = [
    (index - 1) * blurredItemContainerHeight,
    index * blurredItemContainerHeight,
    (index + 1) * blurredItemContainerHeight,
    (index + 2) * blurredItemContainerHeight,
  ];

  const blurOutputRange = [0.1, 0.1, 40, 0.1];

  const blur = useDerivedValue<number>(() => {
    return interpolate(
      contentOffsetY.get(),
      inputRange,
      blurOutputRange,
      Extrapolate.CLAMP,
    );
  }, []);

  const rContainerStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      contentOffsetY.get(),
      inputRange,
      [0, 0, Math.PI / 20, 0],
      Extrapolate.CLAMP,
    );

    return {
      transform: [
        {
          rotate: `${rotate}rad`,
        },
      ],
    };
  }, []);

  // Primitive first: an unchanged scale doesn't notify, so items outside the
  // input range stop rebuilding the transform (and redrawing their canvas)
  // on every scroll event.
  const scale = useDerivedValue(() => {
    return interpolate(
      contentOffsetY.get(),
      inputRange,
      [0.8, 1, 0.8, 1],
      Extrapolate.CLAMP,
    );
  }, []);

  const transformGroup = useDerivedValue(() => {
    return [
      {
        scale: scale.get(),
      },
    ];
  }, []);

  return (
    <Animated.View style={rContainerStyle}>
      <Canvas
        style={{
          width: width,
          height: blurredItemContainerHeight,
        }}>
        <Group
          transform={transformGroup}
          origin={{
            x: width / 2,
            y: 0,
          }}>
          {/* A BlurMask whose sigma changes every frame made Skia rebuild the
              blurred rrect mask on the CPU for every new sigma. Blurring a
              white rrect in a layer (GPU blur) and painting the gradient
              over it with srcIn gives the same picture: gradient colour,
              blurred coverage. The canvas is transparent, so srcIn only
              keeps what the layer drew. */}
          <Group
            layer={
              <Paint>
                <Blur blur={blur} />
              </Paint>
            }>
            <RoundedRect
              x={horizontalPadding / 2}
              y={verticalPadding / 2}
              width={width - horizontalPadding}
              height={blurredItemContainerHeight - verticalPadding}
              r={20}
              color="white"
            />
          </Group>
          <Fill blendMode="srcIn">
            <LinearGradient
              start={{ x: 0, y: 0 }}
              end={{ x: width, y: blurredItemContainerHeight }}
              colors={['#9459F4', '#3411E4']}
            />
          </Fill>
        </Group>
      </Canvas>
    </Animated.View>
  );
};

export { BlurredItem };
