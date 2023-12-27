import {
  BlurMask,
  Canvas,
  Extrapolate,
  Group,
  LinearGradient,
  RoundedRect,
  interpolate,
} from '@shopify/react-native-skia';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';

type BlurredItemProps = {
  index: number;
  height: number;
  width: number;
  horizontalPadding?: number;
  verticalPadding?: number;
  contentOffsetY: Animated.SharedValue<number>;
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

  const blur = useDerivedValue(() => {
    return interpolate(
      contentOffsetY.value,
      inputRange,
      blurOutputRange,
      Extrapolate.CLAMP,
    );
  }, []);

  const rContainerStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      contentOffsetY.value,
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

  const transformGroup = useDerivedValue(() => {
    const scale = interpolate(
      contentOffsetY.value,
      inputRange,
      [0.8, 1, 0.8, 1],
      Extrapolate.CLAMP,
    );
    return [
      {
        scale,
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
          <RoundedRect
            x={horizontalPadding / 2}
            y={verticalPadding / 2}
            width={width - horizontalPadding}
            height={blurredItemContainerHeight - verticalPadding}
            r={20}>
            <LinearGradient
              start={{ x: 0, y: 0 }}
              end={{ x: width, y: blurredItemContainerHeight }}
              colors={['#9459F4', '#3411E4']}
            />
          </RoundedRect>
          <BlurMask blur={blur} />
        </Group>
      </Canvas>
    </Animated.View>
  );
};

export { BlurredItem };
