import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useEffect, useMemo } from 'react';

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
import Transition from 'react-native-screen-transitions';

import { SEARCH_BOUNDS_GROUP } from './constants';
import { DEMOS } from './demos';
import { getIconSource } from './icon-source';

import type { Demo } from './demos';
import type { SharedValue } from 'react-native-reanimated';

// iOS 26 Liquid Glass for the field where available; a translucent gray pill
// otherwise (older iOS / Android).
const LIQUID_GLASS = isLiquidGlassAvailable();
const BAR_HEIGHT = 48;
const BAR_TOP_GAP = 10;

// True progressive (variable) blur: instead of one uniform blur faded by a mask,
// stack several blur layers of INCREASING intensity, each masked to a shorter
// top slice. They accumulate — the very top gets every layer (heaviest blur),
// and each successive band down drops the strongest layer — so the blur RADIUS
// ramps smoothly from heavy (under the field) to sharp, instead of a flat blur
// that just fades out. `end` is the fraction of the band the layer covers before
// its mask fades to transparent.
const BLUR_LAYERS = [
  { intensity: 10, end: 1.0 },
  { intensity: 22, end: 0.7 },
  { intensity: 44, end: 0.45 },
  { intensity: 80, end: 0.26 },
];

interface Props {
  // Monotonic reveal 0 → 1: tracks the pull during the drag, then eases to 1 on
  // commit (never dips — so the surface never flickers mid-commit).
  reveal: SharedValue<number>;
  // Whether the search view is committed (input focused, results interactive).
  searchMode: boolean;
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
// Each result row is a shared-bound Trigger (own group, keyed by slug), so a
// demo opened from search zooms out of THIS row and dismisses back into it —
// identical mechanism to the grid icon's open-zoom.
const SearchRow = ({
  demo,
  iconSize,
  onSelect,
}: {
  demo: Demo;
  iconSize: number;
  onSelect: (slug: string) => void;
}) => (
  <Transition.Boundary.Trigger
    id={demo.slug}
    group={SEARCH_BOUNDS_GROUP}
    style={styles.row}
    onPress={() => onSelect(demo.slug)}>
    <Image
      source={getIconSource(demo.slug)}
      style={[
        styles.rowIcon,
        // Match the home-grid icon's continuous-corner ratio (borderCurve set in
        // the base rowIcon style).
        // eslint-disable-next-line refined/border-radius-with-curve
        { width: iconSize, height: iconSize, borderRadius: iconSize * 0.2237 },
      ]}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={demo.slug}
    />
    <Text style={styles.rowName} numberOfLines={1}>
      {demo.name}
    </Text>
  </Transition.Boundary.Trigger>
);

export const SearchReveal = ({
  reveal,
  searchMode,
  sideMargin,
  iconSize,
  query,
  onChangeQuery,
  onCancel,
  onSelect,
  inputRef,
}: Props) => {
  const insets = useSafeAreaInsets();

  // Focus the field once search commits (after the surface has fully revealed)
  // so the keyboard rises with the reveal rather than racing the mount.
  useEffect(() => {
    if (!searchMode) return undefined;
    const t = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [searchMode, inputRef]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DEMOS;
    return DEMOS.filter(d => d.name.toLowerCase().includes(q));
  }, [query]);

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
  const listTop = barBottom + 10;
  // Extend the band below the bar so the blur ramps over a short zone.
  const blurBandHeight = barBottom + 40;
  // Separator inset: starts under the label, not the icon (iOS style).
  const separatorInset = iconSize + 14;

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
          data={results}
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
          ItemSeparatorComponent={() => (
            <View style={[styles.separator, { marginLeft: separatorInset }]} />
          )}
          renderItem={({ item }) => (
            <SearchRow demo={item} iconSize={iconSize} onSelect={onSelect} />
          )}
        />
      </Animated.View>

      {/* Progressive blur band at the top: a BlurView masked by a vertical
          gradient (opaque at the top → transparent below) so list content
          dissolves into blur as it scrolls up under the search field — the iOS
          scroll-edge effect. (clerk-toast masked-blur technique.) Leads the
          reveal with the field. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.blurBand, { height: blurBandHeight }, rField]}>
        {BLUR_LAYERS.map(layer => (
          <MaskedView
            key={layer.intensity}
            style={StyleSheet.absoluteFill}
            maskElement={
              <LinearGradient
                // Opaque across this layer's top slice, then a soft fade to
                // transparent — so stronger (shorter) layers pile onto the top.
                locations={[0, layer.end, Math.min(layer.end + 0.2, 1)]}
                colors={['rgba(0,0,0,1)', 'rgba(0,0,0,1)', 'rgba(0,0,0,0)']}
                style={StyleSheet.absoluteFill}
              />
            }>
            <BlurView
              intensity={layer.intensity}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          </MaskedView>
        ))}
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
    paddingVertical: 7,
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
