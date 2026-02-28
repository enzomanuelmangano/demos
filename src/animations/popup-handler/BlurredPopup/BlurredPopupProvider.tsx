import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { type FC, type ReactNode, useCallback, useMemo, useState } from 'react';

import { BlurView } from 'expo-blur';
import { PressableOpacity } from 'pressto';
import Animated, {
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { BlurredPopupContext } from './BlurredContext';

import type { PopupAlignment, PopupOptionType } from './BlurredContext';
import type { ViewProps, ViewStyle } from 'react-native';
import type { MeasuredDimensions } from 'react-native-reanimated';

type MenuLayout = {
  backgroundColor?: string;
  titleColor?: string;
  listItemHeight?: number;
};

type BlurredPopupProviderProps = {
  children?: ReactNode;
  menuLayout?: MenuLayout;
  maxBlur?: number;
};

const DEFAULT_MENU_LAYOUT: Required<MenuLayout> = {
  backgroundColor: 'rgba(255,255,255,0.95)',
  titleColor: '#1a1a1a',
  listItemHeight: 54,
};

const BlurredPopupProvider: FC<BlurredPopupProviderProps> = ({
  children,
  menuLayout: menuLayoutProp,
  maxBlur = 5,
}) => {
  const [params, setParams] = useState<{
    node: ReactNode;
    layout: MeasuredDimensions;
    options?: PopupOptionType[];
  } | null>(null);

  const menuVisible = useSharedValue(false);
  const menuOpacity = useDerivedValue(() => {
    return withTiming(menuVisible.value ? 1 : 0, {
      duration: 200,
    });
  });

  const menuScale = useDerivedValue(() => {
    return withTiming(menuVisible.value ? 1 : 0.95, {
      duration: 200,
    });
  });

  const blurOpacity = useSharedValue(0);

  const options = useMemo(() => {
    if (!params) return [];
    return params.options;
  }, [params]);

  const showPopup = useCallback(
    ({
      node,
      layout,
      options: popupOptions,
    }: {
      node: ReactNode;
      layout: MeasuredDimensions;
      options: PopupOptionType[];
    }) => {
      setParams({ node, layout, options: popupOptions });
      menuVisible.value = true;
      blurOpacity.value = withTiming(1, {
        duration: 300,
      });
    },
    [menuVisible, blurOpacity],
  );

  const canvasSize = useWindowDimensions();

  const dismissBlurredPopup = useCallback(() => {
    blurOpacity.value = withTiming(0, {
      duration: 300,
    });
  }, [blurOpacity]);

  const resetParams = useCallback(() => {
    setParams(null);
  }, []);

  useAnimatedReaction(
    () => {
      return blurOpacity.value;
    },
    (value, prevValue) => {
      if (value === 0 && prevValue && prevValue > value) {
        scheduleOnRN(resetParams);
      }
    },
  );

  const close = useCallback(() => {
    menuVisible.value = false;
    setTimeout(() => {
      dismissBlurredPopup();
    }, 100);
  }, [dismissBlurredPopup, menuVisible]);

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
  const menuAnimatedProps = useAnimatedProps(() => {
    return {
      pointerEvents: hasParams ? 'auto' : 'none',
    } as Partial<ViewProps>;
  }, [hasParams]);

  const blurViewStyle = useMemo(() => {
    return {
      ...StyleSheet.absoluteFill,
      zIndex: params?.node ? 100 : -10,
    };
  }, [params?.node]);

  const rBlurViewStyle = useAnimatedStyle(() => {
    return {
      opacity: blurOpacity.value,
    };
  });

  const menuLayout = useMemo(() => {
    return { ...DEFAULT_MENU_LAYOUT, ...menuLayoutProp };
  }, [menuLayoutProp]);

  const popupItems = options?.length ?? 0;
  const popupHeight = menuLayout.listItemHeight * popupItems;

  const popupStyle = useMemo(() => {
    if (!params) return {} as ViewStyle;
    const { pageX, pageY, width, height } = params.layout;

    const yAlignment =
      canvasSize.height - pageY - popupHeight < 100 ? 'top' : 'bottom';
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
      transform: [{ scale: menuScale.value }],
    };
  });

  const value = useMemo(() => {
    return {
      showPopup,
    };
  }, [showPopup]);

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
                  <PressableOpacity
                    onPress={() => {
                      close();
                      onPress?.();
                    }}
                    key={index}
                    style={[
                      {
                        height: menuLayout.listItemHeight,
                        backgroundColor: menuLayout.backgroundColor,
                      },
                      styles.popupListItem,
                      index === 0 && styles.firstItem,
                      index === (options?.length ?? 0) - 1 && styles.lastItem,
                    ]}>
                    {leading && (
                      <View style={styles.leadingContainer}>{leading}</View>
                    )}
                    <Text
                      style={[{ color: menuLayout.titleColor }, styles.title]}>
                      {label}
                    </Text>
                    <View style={styles.fill} />
                    {trailing && (
                      <View style={styles.trailingContainer}>{trailing}</View>
                    )}
                  </PressableOpacity>
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
        <Animated.View
          style={[blurViewStyle, rBlurViewStyle]}
          pointerEvents={hasParams ? 'auto' : 'none'}>
          <BlurView
            intensity={maxBlur * 20}
            style={StyleSheet.absoluteFill}
            onTouchEnd={close}
            tint="dark"
          />
        </Animated.View>
        <View style={styles.fill}>{children}</View>
      </BlurredPopupContext.Provider>
    </>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  firstItem: {
    borderCurve: 'continuous',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  lastItem: {
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderBottomWidth: 0,
    borderCurve: 'continuous',
  },
  leadingContainer: {
    marginRight: 12,
  },
  mainPopupContainerView: {
    ...StyleSheet.absoluteFill,
    zIndex: 500,
  },
  nodeZ: {
    zIndex: -30,
  },
  popup: {
    borderCurve: 'continuous',
    borderRadius: 12,
    boxShadow: '0px 8px 16px rgba(0, 0, 0, 0.25)',
    overflow: 'hidden',
    zIndex: 20,
  },
  popupBackground: {
    ...StyleSheet.absoluteFill,
    zIndex: -20,
  },
  popupListItem: {
    alignItems: 'center',
    borderBottomColor: 'rgba(0,0,0,0.08)',
    borderBottomWidth: 0.5,
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  trailingContainer: {
    marginLeft: 8,
  },
});

export { BlurredPopupProvider };
