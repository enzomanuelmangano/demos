import { type FC, type ReactNode, useCallback, useContext } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { measure, useAnimatedRef } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { BlurredPopupContext } from './BlurredContext';

import type { PopupOptionType } from './BlurredContext';
import type { StyleProp, ViewStyle } from 'react-native';
import type { MeasuredDimensions } from 'react-native-reanimated';

// import HapticFeedback from 'react-native-haptic-feedback';

type TouchablePopupHandlerProps = {
  /**
   * The content to be wrapped by the `TouchablePopupHandler` component.
   */
  children?: ReactNode;
  /**
   * An alternative content to be displayed in the popup instead of the wrapped content.
   */
  highlightedChildren?: ReactNode;
  /**
   * The style to be applied to the wrapped view.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * A callback function to be called when the wrapped view is pressed.
   */
  onPress?: () => void;
  /**
   * An array of options for the popup menu.
   */
  options: PopupOptionType[];
};

/**
 * TouchablePopupHandler is a component used to wrap the node that will trigger a popup.
 * It provides a LongPress gesture that, when triggered, measures the dimensions of the wrapped node
 * and shows the popup using the BlurredPopupContext.
 * It also supports a single tap gesture that can trigger an optional onPress callback.
 */
const TouchablePopupHandler: FC<TouchablePopupHandlerProps> = ({
  children,
  style,
  onPress,
  highlightedChildren,
  options,
}) => {
  // We use an Animated Ref to measure the node dimensions on the UI Thread
  const viewRef = useAnimatedRef<Animated.View>();
  const { showPopup } = useContext(BlurredPopupContext);

  /**
   * Wrapped function that calls the showPopup function with the measured dimensions and other options.
   * This function is passed to runOnJS to ensure it's executed on the JS thread.
   * @param layout - The measured dimensions of the wrapped node.
   */
  const wrappedJsShowPopup = useCallback(
    (layout: MeasuredDimensions) => {
      showPopup({ layout, node: highlightedChildren ?? children, options });
    },
    [showPopup, highlightedChildren, children, options],
  );

  const runLightFeedback = useCallback(() => {
    // HapticFeedback.trigger('impactLight', { enableVibrateFallback: true });
  }, []);

  // Create a LongPress gesture that triggers the wrappedJsShowPopup function when started.
  const longPressGesture = Gesture.LongPress()
    .minDuration(450)
    .onStart(() => {
      // Measure the node dimensions on the UI Thread, thanks to the useAnimatedRef hook
      // The measure function is a Reanimated function that returns a MeasuredDimensions object
      const dimensions = measure(viewRef); // Sync measure
      // Since the showPopup function is not a Reanimated function, we need to wrap it with runOnJS
      scheduleOnRN(
        wrappedJsShowPopup,
        dimensions ?? {
          x: 0,
          y: 0,
          width: 0,
          height: 0,
          pageX: 0,
          pageY: 0,
        },
      );
      // run smooth feedback on long pr;ess
      scheduleOnRN(runLightFeedback);
    });

  // Create a single tap gesture that triggers the onPress function when the user taps on the node.
  const singleTapGesture = Gesture.Tap().onTouchesUp(() => {
    // If the user taps on the node, we call the onPress function
    if (onPress) scheduleOnRN(onPress);
  });

  // To avoid conflicts between the two gestures, we use the Exclusive Gesture.
  const gesture = Gesture.Exclusive(longPressGesture, singleTapGesture);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View ref={viewRef} style={style}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
};

export { TouchablePopupHandler };
