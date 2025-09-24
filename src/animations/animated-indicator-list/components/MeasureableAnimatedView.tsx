import { forwardRef, useCallback, useImperativeHandle, useMemo } from 'react';
import type { ViewProps } from 'react-native';
import type { MeasuredDimensions } from 'react-native-reanimated';
import Animated, { measure, useAnimatedRef } from 'react-native-reanimated';

type MeasureFunction = () => MeasuredDimensions | null;

type MeasureableAnimatedViewRef = {
  reanimatedMeasure: MeasureFunction;
};

// Basically the same as Animated.View, but with a reanimatedMeasure function
// that returns the measured dimensions of the view.
// The point is that we want an array of refs to get the layout of the headers
// but we can't define an array of Refs by using the useAnimatedRef hook.
// In the Main file, we use a useMemo hook to create an array of refs.

// --- Code (useHeaderLayout.ts) ---
// const headersLayoutXRefs = useConst(() =>
//   headers.map(() => React.createRef<MeasureableAnimatedViewRef>()),
// );
// --- End of code from (useHeaderLayout.ts) ---

// If it was possible to define an array of refs with useAnimatedRef, we could
// use the useAnimatedRef hook instead of the React.createRef<MeasureableAnimatedViewRef>() function.
// Basically something like that:
// const headersLayoutXRefs = useConst(() =>
//   headers.map(() => useAnimatedRef<Animated.View>())
// );
// Unfortunately, it's not possible to map through the useAnimatedRef hook.

// So the trick is that we create an array of refs with the React.createRef<MeasureableAnimatedViewRef>() function
// and then we use the useAnimatedRef hook to get the ref of the Animated.View.
// We pass the ref of the Animated.View to the MeasureableAnimatedView component.

// The MeasureableAnimatedView component has a reanimatedMeasure function that returns the measured dimensions of the view.
// We use the reanimatedMeasure function to get the layout of the headers.

// I know that's super abstract as an explanation, but I hope it helps.
// Simply keep in mind that the MeasureableAnimatedView component is just a wrapper around Animated.View.
// That can be useful if you want to get the layout of a view by using a React Ref instead of a Reanimated Ref.
const MeasureableAnimatedView = forwardRef<
  MeasureableAnimatedViewRef,
  ViewProps
>((props, ref) => {
  const animatedRef = useAnimatedRef<Animated.View>();

  const rMeasure: MeasureFunction = useCallback(() => {
    'worklet';
    // We can only use the measure function in the worklet.
    return measure(animatedRef);
  }, [animatedRef]);

  const imperativeValue = useMemo(() => {
    return {
      reanimatedMeasure: rMeasure,
    };
  }, [rMeasure]);

  useImperativeHandle(ref, () => imperativeValue, [imperativeValue]);

  return <Animated.View {...props} ref={animatedRef} />;
});

export { MeasureableAnimatedView };
export type { MeasureableAnimatedViewRef };
