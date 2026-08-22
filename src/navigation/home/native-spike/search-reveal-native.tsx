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
import { Link } from 'expo-router';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DEMOS } from '../demos';
import { getIconSource } from '../icon-source';
import { ICON_RADIUS_RATIO } from '../use-grid-layout';

import type { Demo } from '../demos';
import type { SharedValue } from 'react-native-reanimated';

// NATIVE-SPIKE variant of search-reveal.tsx. Identical surface (liquid-glass
// field, progressive top blur, results list) with ONE mechanism swapped: a
// result row is a Link.Trigger (withAppleZoom) source instead of a
// screen-transitions Boundary.Trigger, so a demo opened from search zooms out
// of the tapped row —
// and dismisses back into it — through the same iOS 18 native zoom the grid
// icons use. No bounds groups, no measure, no overlay: the row view itself is
// handed to UIKit as the transition source.
const LIQUID_GLASS = isLiquidGlassAvailable();
const BAR_HEIGHT = 48;
const BAR_TOP_GAP = 10;

// True progressive (variable) blur: stacked layers of increasing intensity,
// each masked to a shorter top slice (see main branch for the full rationale).
const BLUR_LAYERS = [
  { intensity: 10, end: 1.0 },
  { intensity: 22, end: 0.7 },
  { intensity: 44, end: 0.45 },
  { intensity: 80, end: 0.26 },
];

const EMPTY_RESULTS: Demo[] = [];

interface Props {
  // Monotonic reveal 0 → 1: tracks the pull during the drag, then eases to 1 on
  // commit (never dips — so the surface never flickers mid-commit).
  reveal: SharedValue<number>;
  // Whether the search view is committed (input focused, results interactive).
  searchMode: boolean;
  // Whether the result LIST should be mounted at all. Rows cost far less here
  // than on the main branch (no transition boundaries), but an idle 122-row
  // FlatList is still dead mount work — keep the lazy gate.
  listActive: boolean;
  sideMargin: number;
  iconSize: number;
  query: string;
  onChangeQuery: (q: string) => void;
  onCancel: () => void;
  // Called when a row is tapped, alongside the Link's own navigation — used by
  // the springboard to drop the keyboard behind the opening demo.
  onSelect: (slug: string) => void;
  inputRef: React.RefObject<TextInput | null>;
}

// One search result row: a native zoom source for its demo route. The Link's
// press both navigates and marks this row as the UIKit zoom source; our own
// onPress (merged by the Slot chain) just handles the keyboard.
const SearchRow = ({
  demo,
  iconSize,
  onSelect,
}: {
  demo: Demo;
  iconSize: number;
  onSelect: (slug: string) => void;
}) => (
  <Link href={`/animations/${demo.slug}`} asChild>
    <Link.Trigger withAppleZoom>
      <Pressable style={styles.row} onPress={() => onSelect(demo.slug)}>
        <Image
          source={getIconSource(demo.slug)}
          style={[
            styles.rowIcon,
            // Match the home-grid icon's continuous-corner ratio (borderCurve
            // set in the base rowIcon style).
            // eslint-disable-next-line refined/border-radius-with-curve
            {
              width: iconSize,
              height: iconSize,
              borderRadius: iconSize * ICON_RADIUS_RATIO,
            },
          ]}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={demo.slug}
        />
        <Text style={styles.rowName} numberOfLines={1}>
          {demo.name}
        </Text>
      </Pressable>
    </Link.Trigger>
  </Link>
);

export const SearchRevealNative = ({
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

  // Field + top blur lead the reveal; the list lags (starts at ~28%) and
  // develops in under the field — same layering as the main branch.
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
      transform: [{ translateY: interpolate(lp, [0, 1], [-20, 0]) }],
    };
  });

  const barTop = insets.top + BAR_TOP_GAP;
  const barBottom = barTop + BAR_HEIGHT;
  const listTop = barBottom + 10;
  const blurBandHeight = barBottom + 40;
  const separatorInset = iconSize + 14;

  // Cancel is ALWAYS rendered (layout space reserved, field width never jumps);
  // fades in over the last stretch of the reveal.
  const rCancel = useAnimatedStyle(() => ({
    opacity: interpolate(reveal.get(), [0.55, 1], [0, 1], Extrapolation.CLAMP),
  }));

  // One TextInput, always — never swapped for a Text — so the placeholder
  // can't flicker on commit.
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
          data={listActive ? results : EMPTY_RESULTS}
          initialNumToRender={14}
          maxToRenderPerBatch={16}
          windowSize={5}
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

      {/* Progressive blur band at the top so list content dissolves into blur
          as it scrolls up under the search field — the iOS scroll-edge effect.
          Leads the reveal with the field. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.blurBand, { height: blurBandHeight }, rField]}>
        {BLUR_LAYERS.map(layer => (
          <MaskedView
            key={layer.intensity}
            style={StyleSheet.absoluteFill}
            maskElement={
              <LinearGradient
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
