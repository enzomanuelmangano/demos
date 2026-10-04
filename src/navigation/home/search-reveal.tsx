import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { memo, useCallback, useEffect, useMemo } from 'react';

import { Ionicons } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VariableBlur } from 'react-native-variable-blur';

import { useDemos } from './demos';
import { getIconSource } from './icon-source';
import { LaunchIcon } from './launch-icon';
import { launchGroupId } from './launch-transition';
import { usePressScale } from './press-scale';
import { ICON_RADIUS_RATIO } from './use-grid-layout';

import type { Demo } from './demos';
import type { SharedValue } from 'react-native-reanimated';

// iOS 26 Liquid Glass for the field where available; a translucent gray pill
// otherwise (older iOS / Android).
const LIQUID_GLASS = isLiquidGlassAvailable();
const BAR_HEIGHT = 48;
/** A result's icon under the finger (see usePressScale); its name dims. */
const ROW_PRESSED_SCALE = 0.88;
const BAR_TOP_GAP = 10;

// The blur behind the search field fades out downwards by its RADIUS, not by
// its opacity. Stacked blur layers under gradient masks (the previous version)
// cut each layer off at the end of its mask, so the band ended on a visible
// edge over the first result. react-native-variable-blur drives one
// continuous radius ramp instead, from `SCROLL_EDGE_BLUR` at the top to sharp
// at the bottom of the band. It is iOS only; elsewhere the band keeps a
// single blur under a gradient mask.
const SCROLL_EDGE_BLUR = 28;

// The scroll edge also FADES what passes under it, as iOS does: a blur alone
// kept the rows' shapes, and text at a middling radius smeared into streaks
// instead of dissolving. The fade is the colour of the defocused home behind
// the list, so a row sinks into the background rather than under a band.
const EDGE_FADE_COLORS = [
  'rgba(31, 31, 32, 0.92)',
  'rgba(31, 31, 32, 0.7)',
  'rgba(31, 31, 32, 0)',
] as const;

const EMPTY_RESULTS: Demo[] = [];

/** Vertical padding of a result row, above and below its icon. */
const ROW_PADDING = 7;
/** Screens of rows kept mounted: enough to hold every demo at once. */
const SEARCH_WINDOW_SIZE = 25;

interface Props {
  // Monotonic reveal 0 → 1: tracks the pull during the drag, then eases to 1 on
  // commit (never dips — so the surface never flickers mid-commit).
  reveal: SharedValue<number>;
  // Whether the search view is committed (input focused, results interactive).
  searchMode: boolean;
  // Whether the result LIST should be mounted at all. False while the grid is
  // at rest: every SearchRow registers a shared element with the launch, and
  // 122 idle registrations are dead work. Flipped on from the first frame of a
  // pull (see springboard.tsx), so the rows are there by the time the surface
  // is visibly revealing.
  listActive: boolean;
  // Horizontal page padding of the grid, so the search surface lines up with it.
  sideMargin: number;
  // Grid icon edge (pt) — result-row icons match the home-grid icon size.
  iconSize: number;
  query: string;
  onChangeQuery: (q: string) => void;
  onCancel: () => void;
  onSelect: (slug: string) => void;
  inputRef: React.RefObject<TextInput | null>;
}

// iOS-App-Library-style pull-to-search. The WHOLE surface — search field AND
// results — tracks the finger from the first pixel of the pull, sliding down +
// fading in together over the blurred grid, so it's progressively visible (not
// only on release). Past the trigger, releasing commits (`searchMode`): the
// field left-aligns, focuses, a Cancel button appears, and the list becomes
// interactive. A short pull that doesn't commit slides everything back out as
// `pull` springs to 0.
//
// The whole thing is PRE-MOUNTED (opacity 0 at rest, pointerEvents none) and the
// reveal is driven purely by shared values on the UI thread — no mid-gesture
// mounts or React re-renders — so the pull stays buttery.
// Each result row's icon is a launch source of its own (the 'search' group),
// so a demo opened from search grows out of THIS row's icon and dismisses back
// into it — the same mechanism as the grid icon.
const SearchRowComponent = ({
  demo,
  iconSize,
  onSelect,
}: {
  demo: Demo;
  iconSize: number;
  onSelect: (slug: string) => void;
}) => {
  const radius = iconSize * ICON_RADIUS_RATIO;
  const press = usePressScale(ROW_PRESSED_SCALE);
  const nameStyle = useAnimatedStyle(() => ({
    opacity: interpolate(press.scale.get(), [ROW_PRESSED_SCALE, 1], [0.6, 1]),
  }));
  return (
    <Pressable
      style={styles.row}
      onPress={() => onSelect(demo.slug)}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}>
      <LaunchIcon
        groupId={launchGroupId('search', demo.slug)}
        size={iconSize}
        radius={radius}
        pressScale={press.scale}>
        <Image
          source={getIconSource(demo.slug)}
          style={[
            styles.rowIcon,
            // Match the home-grid icon's continuous-corner ratio (borderCurve
            // set in the base rowIcon style).
            // eslint-disable-next-line refined/border-radius-with-curve
            { width: iconSize, height: iconSize, borderRadius: radius },
          ]}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={demo.slug}
        />
      </LaunchIcon>
      <Animated.Text style={[styles.rowName, nameStyle]} numberOfLines={1}>
        {demo.name}
      </Animated.Text>
    </Pressable>
  );
};
const SearchRow = memo(SearchRowComponent);

export const SearchReveal = ({
  reveal,
  searchMode,
  listActive,
  sideMargin,
  iconSize,
  query,
  onChangeQuery,
  onCancel,
  onSelect,
  inputRef,
}: Props) => {
  const insets = useSafeAreaInsets();
  const demos = useDemos();

  // Focus the field once search commits (after the surface has fully revealed)
  // so the keyboard rises with the reveal rather than racing the mount.
  useEffect(() => {
    if (!searchMode) return undefined;
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [searchMode, inputRef]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return demos;
    return demos.filter(d => d.name.toLowerCase().includes(q));
  }, [query, demos]);

  // Reveal progress 0 → 1: live pull (until the trigger) OR the pinned commit
  // level. Layered so the surface reveals like iOS rather than snapping in:
  //  • the search field + top blur lead — they fade + slide down tracking the
  //    finger from the first pixel;
  //  • the results LAG (start at ~28% progress) and ease up a touch slower, so
  //    the list "develops in" under the field instead of popping with it.
  const rField = useAnimatedStyle(() => {
    const prog = reveal.get();
    return {
      opacity: prog,
      transform: [{ translateY: interpolate(prog, [0, 1], [-16, 0]) }],
    };
  });
  const rList = useAnimatedStyle(() => {
    const lp = interpolate(
      reveal.get(),
      [0.28, 1],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: lp,
      // Descend into place (from above) so the list enters WITH the downward
      // pull, not against it — same direction as the field.
      transform: [{ translateY: interpolate(lp, [0, 1], [-20, 0]) }],
    };
  });

  const barTop = insets.top + BAR_TOP_GAP;
  const barBottom = barTop + BAR_HEIGHT;
  // Where the result list starts, and how tall the top progressive-blur band is.
  // The gap is the fade's runway: over 10pt a row reached the glass field
  // barely faded, and the field refracted its text into streaks.
  const listTop = barBottom + 24;
  // The band ends where the list starts. It ran 30pt further and blurred the
  // top of the first result at rest; a row should only dissolve once it has
  // scrolled up under the field.
  const blurBandHeight = listTop;
  // Separator inset: starts under the label, not the icon (iOS style).
  const separatorInset = iconSize + 14;
  // Stable across renders: an inline separator is a new component type every
  // render, so each keystroke and reveal step remounted every separator, and
  // an inline renderItem re-rendered every row.
  const Separator = useMemo(() => {
    const SeparatorLine = () => (
      <View style={[styles.separator, { marginLeft: separatorInset }]} />
    );
    return SeparatorLine;
  }, [separatorInset]);
  // A row is its icon and its padding (the name is one line, shorter than the
  // icon), plus the hairline separator after it.
  const rowStride = iconSize + ROW_PADDING * 2 + StyleSheet.hairlineWidth;
  const getItemLayout = useCallback(
    (_: ArrayLike<Demo> | null | undefined, index: number) => ({
      length: rowStride,
      offset: rowStride * index,
      index,
    }),
    [rowStride],
  );
  const renderItem = useCallback(
    ({ item }: { item: Demo }) => (
      <SearchRow demo={item} iconSize={iconSize} onSelect={onSelect} />
    ),
    [iconSize, onSelect],
  );

  // Cancel is ALWAYS rendered (so its layout space is reserved and the field
  // width never jumps); it only fades in over the last stretch of the reveal, so
  // it appears as the search commits rather than partway through a pull.
  const rCancel = useAnimatedStyle(() => ({
    opacity: interpolate(reveal.get(), [0.55, 1], [0, 1], Extrapolation.CLAMP),
  }));

  // One TextInput, always — never swapped for a Text — so the placeholder can't
  // flicker on commit. It only becomes editable/focusable once committed.
  const fieldContent = (
    <>
      <Ionicons name="search" size={18} color="#8e8e93" />
      <TextInput
        ref={inputRef}
        style={styles.input}
        value={query}
        onChangeText={onChangeQuery}
        placeholder="Search"
        placeholderTextColor="#8e8e93"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
    </>
  );

  const fieldStyle = [
    styles.searchBar,
    LIQUID_GLASS ? null : styles.searchBarFallback,
  ];

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={searchMode ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, rList]}>
        <FlatList
          style={StyleSheet.absoluteFill}
          // Zero rows mounted while the grid is at rest (see listActive above).
          // Once search opens, the first screen mounts at once and the rest in
          // batches while idle, and then they stay: the window spans the whole
          // list. A window of a screen and a half mounted and unmounted rows
          // (a shared element and an image each) under the finger, on every
          // scroll, and that is what stuttered.
          data={listActive ? results : EMPTY_RESULTS}
          initialNumToRender={12}
          maxToRenderPerBatch={8}
          windowSize={SEARCH_WINDOW_SIZE}
          // Every row is the same height: no row has to be measured to place
          // the next, and the scroll never waits on a layout pass.
          getItemLayout={getItemLayout}
          // Off-screen rows leave the native hierarchy, so re-clipping on
          // scroll only walks the rows in view.
          removeClippedSubviews
          keyExtractor={item => item.slug}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            paddingTop: listTop,
            paddingHorizontal: sideMargin,
            paddingBottom: insets.bottom + 40,
          }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={searchMode}
          ItemSeparatorComponent={Separator}
          renderItem={renderItem}
        />
      </Animated.View>

      {/* Progressive blur band at the top: list content dissolves into blur as
          it scrolls up under the search field — the iOS scroll-edge effect.
          Leads the reveal with the field. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.blurBand, { height: blurBandHeight }, rField]}>
        {Platform.OS === 'ios' ? (
          <VariableBlur
            blurRadius={SCROLL_EDGE_BLUR}
            direction="down"
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <MaskedView
            style={StyleSheet.absoluteFill}
            maskElement={
              <LinearGradient
                colors={['rgba(0,0,0,1)', 'rgba(0,0,0,0)']}
                style={StyleSheet.absoluteFill}
              />
            }>
            <BlurView
              intensity={40}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          </MaskedView>
        )}
        {/* Mostly faded by the bottom of the field, clear where the list
            starts: a row is untouched at rest and gone under the field. */}
        <LinearGradient
          colors={EDGE_FADE_COLORS}
          locations={[0, barBottom / blurBandHeight, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.searchRow,
          { top: barTop, left: sideMargin, right: sideMargin },
          rField,
        ]}>
        {LIQUID_GLASS ? (
          <GlassView
            style={fieldStyle}
            glassEffectStyle="regular"
            isInteractive={false}>
            {fieldContent}
          </GlassView>
        ) : (
          <View style={fieldStyle}>{fieldContent}</View>
        )}
        <Animated.View
          style={[styles.cancelBtn, rCancel]}
          pointerEvents={searchMode ? 'auto' : 'none'}>
          <Pressable hitSlop={10} onPress={onCancel}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  blurBand: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  cancel: {
    color: '#ffffff',
    fontSize: 17,
  },
  cancelBtn: {
    paddingLeft: 12,
  },
  input: {
    color: '#ffffff',
    flex: 1,
    fontSize: 17,
    padding: 0,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    paddingVertical: ROW_PADDING,
  },
  rowIcon: {
    backgroundColor: '#1c1c1e',
    borderCurve: 'continuous',
  },
  rowName: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 17,
    fontWeight: '500',
  },
  // The iOS search field: ~48pt tall liquid-glass pill (material from GlassView).
  searchBar: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 22,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    height: BAR_HEIGHT,
    justifyContent: 'flex-start',
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  // Fallback fill when Liquid Glass isn't available (older iOS / Android).
  searchBarFallback: {
    backgroundColor: 'rgba(118,118,128,0.24)',
  },
  searchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    position: 'absolute',
  },
  separator: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    height: StyleSheet.hairlineWidth,
  },
});
