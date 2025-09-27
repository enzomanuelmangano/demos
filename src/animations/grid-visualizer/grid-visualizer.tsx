import {
  Atlas,
  Canvas,
  Fill,
  Skia,
  useRSXformBuffer,
  useRectBuffer,
  useTexture,
  type SkFont,
} from '@shopify/react-native-skia';
import { useMemo, type FC } from 'react';
import {
  Extrapolation,
  interpolate,
  makeMutable,
  useAnimatedReaction,
  useDerivedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

type GridVisualizerProps = {
  text: SharedValue<string | null>; // The text to display (e.g. '99')
  font: SkFont | null; // The font to use for the text
  width: number; // the Canvas width
  height: number; // the Canvas height
  hSquaresAmount: number; // the amount of horizontal squares
  vSquaresAmount: number; // the amount of vertical squares
  squareSize: number; // the size of each small square

  // This was hard to name, and I think it's not the best name at all.
  // To visualize it, I recommend you to set it to 0 and to increase it
  // manually to see what happens
  scaleFactor: number;
};

// The whole idea of this component is to display a grid of squares.
// A text is going to be passed to the grid, but it won't be displayed as a regular text.
// The text will be converted to a path, and all the squares that are contained in the path
// will be highlighted with a different color and remapped to a different position (depending on the scaleFactor).

// To achieve this, we need to:
// - Create a path from the text
// - Create a grid of squares
// - Check if each square is contained in the path (activeRects)
// - Animate the squares that are contained in the path (activeProgress)
// - Animate the colors of the squares that are contained in the path (colors)
// - Animate the position of the squares that are contained in the path (transforms)

// Since the component can support a ton of squares, we can't use
// neither regular Animated.Views nor regular Skia Rects.
// We need to use the Atlas API from Skia which supports rendering a lot of sprites with the same texture.

// From the [Skia docs](https://shopify.github.io/react-native-skia/docs/shapes/atlas/)
// The Atlas component is used for efficient rendering of multiple instances of the same texture or image.
// It is especially useful for drawing a very large number of similar objects, like sprites, with varying transformations.

// The Atlas API is a bit low-level, but it's super powerful.
// Keep in mind that (in my opinion) without Atlas, you just can't make this animation with a decent performance :)
export const GridVisualizer: FC<GridVisualizerProps> = ({
  text,
  font,
  width: canvasWidth,
  height: canvasHeight,
  hSquaresAmount: HSquares,
  vSquaresAmount: VSquares,
  scaleFactor,
  squareSize: squareSize,
}) => {
  const XSpacing = (canvasWidth - scaleFactor) / HSquares;
  const YSpacing = (canvasHeight - scaleFactor) / VSquares;
  const SquaresAmount = HSquares * VSquares;
  const ScaledXSpacing = canvasWidth / HSquares;
  const ScaledYSpacing = canvasHeight / VSquares;

  // Convert the Text into a Skia Path
  // We'll need to do that because we wan't to check if each square is contained in a Text
  // But we can't do that with a regular text, we need to convert it to a Path (which provides the "contains" method)
  const animatedText = useDerivedValue(() => {
    if (!text.value || !font) {
      return null;
    }
    const textDim = font?.measureText(text.value) ?? {
      width: 0,
      height: 0,
    };
    const x = canvasWidth / 2 - textDim.width / 2;
    const y = canvasHeight / 2 + textDim.height / 2;

    const t = Skia.Path.MakeFromText(text.value, x, y, font);

    return t;
  }, [font]);

  // We need to check if each square is contained in the Text Path
  // To do that, we'll use the "contains" method from the Path
  // We'll use a derived value to do that because we need to check it every frame
  const activeRects = useDerivedValue(() => {
    return new Array(SquaresAmount).fill(false).map((_, i) => {
      const tx = (i % HSquares) * XSpacing + (XSpacing + scaleFactor) / 2;
      const ty =
        Math.floor(i / HSquares) * YSpacing + (YSpacing + scaleFactor) / 2;

      return animatedText.value?.contains(
        tx + squareSize / 2,
        ty + squareSize / 2,
      );
    });
  }, []);

  // This randomDelays is very hard to explain, but it's the key to make the animation look good.
  // My first intention was to do something like that. But this won't work because the delay is going to be the same for all the squares.
  // Instead, we need to generate a random delay for each square to make the animation look more organic.
  // I was really panicking because I didn't have any idea of how to achieve that.
  // const activeProgress = useDerivedValue(() => {
  //   return withDelay(
  //     Math.random(),
  //     withSpring(
  //       activeRects.value.map((isActive, i) => {
  //         return isActive ? 1 : 0;
  //       }),
  //       { mass: 2 },
  //     ),
  //   );
  // }, []);

  // Create an array of individual shared values for progress, one for each square
  // This follows the spiral pattern of using makeMutable for each element
  const progressValues = useMemo(() => {
    const values: SharedValue<number>[] = [];
    for (let i = 0; i < SquaresAmount; i++) {
      values.push(makeMutable(0));
    }
    return values;
  }, [SquaresAmount]);

  // Create an array of individual shared values for random delays, one for each square
  const delayValues = useMemo(() => {
    const values: SharedValue<number>[] = [];
    for (let i = 0; i < SquaresAmount; i++) {
      values.push(makeMutable(Math.random() - 0.5));
    }
    return values;
  }, [SquaresAmount]);

  // Use animated reaction to update each individual shared value when activeRects changes
  // This mimics the spiral's pattern of updating individual shared values
  useAnimatedReaction(
    () => activeRects.value,
    newActiveRects => {
      // First update delay values
      for (let i = 0; i < SquaresAmount; i++) {
        const isActive = newActiveRects[i];
        delayValues[i].set(
          withSpring(isActive ? 1 : Math.random() - 0.5, {
            duration: 2000,
          }),
        );
      }

      // Then update progress values based on delay values
      for (let i = 0; i < SquaresAmount; i++) {
        const isActive = newActiveRects[i];
        progressValues[i].set(
          withSpring(isActive ? delayValues[i].get() : 0, { mass: 2 }),
        );
      }
    },
  );

  // Since we're using the Atlas API, we need to pass a Float32Array as color.
  // The Float32Array accepts 4 values: [R, G, B, A]
  // The idea is to animate organically the alpha value of the color.
  // The interpolation function is a bit tricky because I just played with the values until I got something that I liked.
  // But the main idea was just to make the squares fade in and fade out.
  // Now we read from individual shared values instead of a shared value array
  const colors = useMemo(() => {
    return progressValues.map(() => {
      // const progress = progressValue.value;
      // const alpha = interpolate(
      //   progress,
      //   [-3, 0, 1, 2],
      //   [0, 0.8, 0, 0],
      //   Extrapolation.CLAMP,
      // );
      return new Float32Array([1, 1, 1, 0.8]);
    });
  }, [progressValues]);

  // We need to provide a texture to the Atlas (We're just saying that the texture is a white by default)
  const texture = useTexture(<Fill color={'white'} />, {
    width: canvasWidth,
    height: canvasHeight,
  });

  // The useRSXformBuffer is a hook provided by Skia that allows us to animate the position and scale of the squares.
  // The idea is that by default, the squares are going to be positioned in a shrinked grid (because of the scaleFactor).
  // When the square gets active, the squares are going to be positioned in a scaled grid
  // If the scaleFactor is 0, the shrinked grid is going to be the same as the scaled grid.
  // The magic happens because of the individual progress shared values and the interpolate function.
  const transforms = useRSXformBuffer(SquaresAmount, (val, i) => {
    'worklet';

    const xShrinkedOffset = (XSpacing + scaleFactor) / 2;
    const yShrinkedOffset = (YSpacing + scaleFactor) / 2;

    const xScaledOffset = ScaledXSpacing / 2;
    const yScaledOffset = ScaledYSpacing / 2;

    const shrinkedTx = (i % HSquares) * XSpacing + xShrinkedOffset;
    const shrinkedTy = Math.floor(i / HSquares) * YSpacing + yShrinkedOffset;

    const scaledTx = (i % HSquares) * ScaledXSpacing + xScaledOffset;
    const scaledTy = Math.floor(i / HSquares) * ScaledYSpacing + yScaledOffset;

    // Read from individual shared value instead of shared value array
    const prog = progressValues[i].value;
    const tx = interpolate(prog, [0, 1], [shrinkedTx, scaledTx]);
    const ty = interpolate(prog, [0, 1], [shrinkedTy, scaledTy]);

    const translatedX = tx;
    const translatedY = ty;

    const scale = interpolate(prog, [0, 1], [0.6, 0.85], Extrapolation.CLAMP);

    val.set(scale, 0, translatedX, translatedY);
  });

  // We need to provide the position of each square to the Atlas
  const sprites = useRectBuffer(SquaresAmount, (val, j) => {
    'worklet';
    const x = (j % HSquares) * XSpacing;
    const y = Math.floor(j / HSquares) * YSpacing;
    val.setXYWH(x, y, squareSize, squareSize);
  });

  return (
    <Canvas
      style={{
        width: canvasWidth,
        height: canvasHeight,
      }}>
      <Atlas
        image={texture}
        sprites={sprites}
        colors={colors}
        transforms={transforms}
      />
    </Canvas>
  );
};
