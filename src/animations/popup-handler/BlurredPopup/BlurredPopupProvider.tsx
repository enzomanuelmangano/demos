/**
 * React component for providing a blurred popup menu.
 */
import type { SkImage } from '@shopify/react-native-skia';
import {
  Canvas,
  makeImageFromView,
  Image,
  useValue,
  useComputedValue,
  rect,
  Blur,
  Group,
} from '@shopify/react-native-skia';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ViewProps, ViewStyle } from 'react-native';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  Text,
} from 'react-native';
import type { MeasuredDimensions } from 'react-native-reanimated';
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { PopupAlignment, PopupOptionType } from './BlurredContext';
import { BlurredPopupContext } from './BlurredContext';

/**
 * Represents the layout properties of the menu.
 */
type MenuLayout = {
  backgroundColor?: string;
  titleColor?: string;
  listItemHeight?: number;
};

/**
 * Represents the properties of the BlurredPopupProvider component.
 */
type BlurredPopupProviderProps = {
  children?: React.ReactNode;
  menuLayout?: MenuLayout;
  maxBlur?: number;
};

// Define default menu layout
const DEFAULT_MENU_LAYOUT: Required<MenuLayout> = {
  backgroundColor: 'rgba(255,255,255,0.75)',
  titleColor: 'black',
  listItemHeight: 50,
};

/**
 * The `BlurredPopupProvider` component wraps the main content of the application and provides a popup menu functionality with a blurred background effect.
 * It uses Skia for image manipulation and Reanimated for animations.
 */
const BlurredPopupProvider: React.FC<BlurredPopupProviderProps> = ({
  children,
  menuLayout: menuLayoutProp,
  maxBlur = 5,
}) => {
  // State variables
  // Image: Skia Image (It's basically a screenshot of the current rendered View)
  // Node: Is the component that is triggering the Popup (or a custom version of it named "highlightedChildren")
  // Layout: Node Measured Dimensions
  // Options: The Popup Menu Options
  const [params, setParams] = useState<{
    node: React.ReactNode;
    layout: MeasuredDimensions;
    options?: PopupOptionType[];
  } | null>(null);

  const menuVisible = useSharedValue(false);
  const menuOpacity = useDerivedValue(() => {
    return withTiming(menuVisible.value ? 1 : 0);
  });

  const skImage = useValue<SkImage | null>(null);

  const options = useMemo(() => {
    if (!params) return [];
    return params.options;
  }, [params]);

  // This Ref is needed in order to apply a ScreenShot to the RenderedView
  // The following snapshot is going to be a Skia Image (and it will be possible to apply Blur on it through the Skia Thread)
  const mainView = useRef(null);

  /**
   * Show the popup menu with the provided parameters.
   */
  const showPopup = useCallback(
    async ({
      node,
      layout,
      // eslint-disable-next-line @typescript-eslint/no-shadow
      options,
    }: {
      node: React.ReactNode;
      layout: MeasuredDimensions;
      options: PopupOptionType[];
    }) => {
      setParams({ node, layout, options });
      menuVisible.value = true;

      // Applying the Snapshot and setting the Popup Params
      skImage.current = await makeImageFromView(mainView);
    },
    [menuVisible, skImage],
  );

  const canvasSize = useWindowDimensions();

  const rBlur = useSharedValue(0);

  const dismissBlurredPopup = useCallback(() => {
    rBlur.value = withTiming(0);
  }, [rBlur]);

  const resetParams = useCallback(() => {
    setParams(null);
  }, []);

  // When the blur value is 0, the popup shouldn't be visible anymore
  useAnimatedReaction(
    () => {
      return rBlur.value;
    },
    (value, prevValue) => {
      if (value === 0 && prevValue && prevValue > value) {
        runOnJS(resetParams)();
      }
    },
  );

  /**
   * Close the popup menu.
   */
  const close = useCallback(() => {
    menuVisible.value = false;
    setTimeout(() => {
      dismissBlurredPopup();
    }, 200);
  }, [dismissBlurredPopup, menuVisible]);

  useEffect(() => {
    // Animate the blur when the image changes
    if (params?.node != null) {
      rBlur.value = withTiming(maxBlur);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.node]);

  // Computed values
  const imageRect = useComputedValue(() => {
    return rect(0, 0, canvasSize.width, canvasSize.height);
  }, [canvasSize]);

  // Recomputes the position of the Node Style (by using the MeasuredDimension)
  const nodeStyle = useMemo(() => {
    if (!params) return { opacity: 0 } as ViewStyle;
    const { pageX, pageY, width, height } = params.layout;
    return {
      position: 'absolute',
      top: pageY,
      left: pageX,
      width,
      height,
      opacity: 1,
    } as ViewStyle;
  }, [params]);

  const hasParams = params != null;
  // The MenuAnimatedProps is responsible for disabling the touch events on the main view
  // when the popup is visible (and vice versa)
  const menuAnimatedProps = useAnimatedProps(() => {
    return {
      pointerEvents: hasParams ? 'auto' : 'none',
    } as Partial<ViewProps>;
  }, [hasParams]);

  // The CanvasStyle is responsible for hiding the Canvas when the popup is not visible
  // The Canvas will simply contain the blurred image (and it will be visible only when the popup is visible)
  const canvasStyle = useMemo(() => {
    return {
      ...StyleSheet.absoluteFillObject,
      flex: 1,
      zIndex: params?.node ? 100 : -10,
      backgroundColor: '#112',
    };
  }, [params?.node]);

  const menuLayout = useMemo(() => {
    return { ...DEFAULT_MENU_LAYOUT, ...menuLayoutProp };
  }, [menuLayoutProp]);

  const popupItems = options?.length ?? 0;
  const popupHeight = menuLayout.listItemHeight * popupItems;

  // The PopupStyle is responsible for positioning the Popup Menu
  const popupStyle = useMemo(() => {
    if (!params) return {} as ViewStyle;
    const { pageX, pageY, width, height } = params.layout;

    // The popup will be positioned on the top or bottom of the Node (depending on the available space)
    const yAlignment =
      canvasSize.height - pageY - popupHeight < 100 ? 'top' : 'bottom';
    // The popup will be positioned on the left or right of the Node (depending on the available space)
    const xAlignment = canvasSize.width - pageX > 200 ? 'left' : 'right';

    const alignment: PopupAlignment =
      `${yAlignment}-${xAlignment}` as PopupAlignment;

    const x = alignment.includes('right') ? width : pageX;
    const y = alignment.includes('bottom')
      ? pageY + height
      : pageY - popupHeight;
    const additionalYSpace = 5 * (yAlignment === 'top' ? -1 : 1);

    return {
      position: 'absolute',
      top: y + additionalYSpace,
      height: popupHeight,
      [xAlignment]: x,
    } as ViewStyle;
  }, [params, popupHeight, canvasSize]);

  const rMenuPopupStyle = useAnimatedStyle(() => {
    return {
      opacity: menuOpacity.value,
    };
  });

  const value = useMemo(() => {
    return {
      showPopup,
    };
  }, [showPopup]);

  // Render the component
  return (
    <>
      <BlurredPopupContext.Provider value={value}>
        <Animated.View
          animatedProps={menuAnimatedProps}
          style={styles.mainPopupContainerView}>
          <Animated.View style={[popupStyle, styles.popup, rMenuPopupStyle]}>
            {params?.node == null || popupItems == null ? (
              // If the image is not available or the popup items are not available, we don't render the popup
              // But we still need to render the View in order to avoid the Swap of zIndex priorities
              <></>
            ) : (
              options?.map(({ leading, trailing, label, onPress }, index) => {
                return (
                  <TouchableOpacity
                    onPress={() => {
                      close();
                      onPress?.();
                    }}
                    activeOpacity={0.9}
                    key={index}
                    style={[
                      {
                        height: menuLayout.listItemHeight,
                        backgroundColor: menuLayout.backgroundColor,
                      },
                      styles.popupListItem,
                    ]}>
                    {leading}
                    <Text
                      style={[{ color: menuLayout.titleColor }, styles.title]}>
                      {label}
                    </Text>
                    <View style={styles.fill} />
                    {trailing}
                  </TouchableOpacity>
                );
              })
            )}
          </Animated.View>
          <>
            <View style={styles.popupBackground} onTouchEnd={close} />
            <Animated.View style={[nodeStyle, styles.nodeZ, rMenuPopupStyle]}>
              {Boolean(params?.node) && params?.node}
            </Animated.View>
          </>
        </Animated.View>
        <Canvas style={canvasStyle} onTouchEnd={close}>
          <Group>
            <Image rect={imageRect} image={skImage}>
              <Blur blur={rBlur} />
            </Image>
          </Group>
        </Canvas>
        {/* The main content of the application */}
        <View ref={mainView} style={styles.fill}>
          {children}
        </View>
      </BlurredPopupContext.Provider>
    </>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  mainPopupContainerView: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 500,
  },
  nodeZ: {
    zIndex: -30,
  },
  popup: {
    borderRadius: 5,
    overflow: 'hidden',
    zIndex: 20,
  },
  popupBackground: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -20,
  },
  popupListItem: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 10,
  },
  title: {
    marginLeft: 5,
    marginRight: 10,
    letterSpacing: 0.5,
  },
});

export { BlurredPopupProvider };
