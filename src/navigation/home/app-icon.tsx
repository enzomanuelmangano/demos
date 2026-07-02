import { Share, StyleSheet, Text, View } from 'react-native';

import { memo, useCallback } from 'react';

import { useSelector } from '@legendapp/state/react';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import Transition from 'react-native-screen-transitions';
import * as ContextMenu from 'zeego/context-menu';

import { activePage$, elevatedSlug$ } from './active-page';
import { BOUNDS_GROUP } from './constants';
import { getIconSource } from './icon-source';
import { AnimationInspirations } from '../../animations/inspirations';

import type { Demo } from './demos';

interface Props {
  demo: Demo;
  // Which page this icon lives on. Used to gate its transition boundary: only
  // the visible page's icons keep an active Trigger (see below).
  pageIndex: number;
  // Position within the page — the springboard derives the icon's on-screen
  // rect from this (deterministic grid layout) to seed the instant open-zoom
  // overlay without an async measure.
  cellIndex: number;
  cellWidth: number;
  cellHeight: number;
  iconSize: number;
  onPress: (slug: string, cellIndex: number) => void;
}

// GitHub source for a demo — folder name === slug (see scripts/generate-icon-map).
const sourceUrl = (slug: string) =>
  `https://github.com/enzomanuelmangano/demos/tree/main/src/animations/${slug}`;

// Just the squircle icon (no label). This is what the shared-bound Trigger wraps
// so the zoom source is the ICON's square frame — NOT the whole cell. Including
// the label in the bound made the source rect a tall non-square (icon on top,
// label below): the demo then zoomed into/out of that rect's centre — which sits
// between the icon and the label — so the closing screen landed OFFSET from the
// icon, and the label itself scaled up into a giant ghost floating over the grid
// mid-close. Bounding the icon square alone makes the zoom symmetric about the
// icon, with no label ghost.
const IconSquare = ({ demo, iconSize }: { demo: Demo; iconSize: number }) => {
  const radius = iconSize * 0.2237; // iOS continuous-corner ratio
  return (
    <View
      style={[
        styles.iconShadow,
        {
          width: iconSize,
          height: iconSize,
          borderRadius: radius,
          borderCurve: 'continuous',
        },
      ]}>
      <View
        style={[
          styles.iconClip,
          {
            width: iconSize,
            height: iconSize,
            borderCurve: 'continuous',
            borderRadius: radius,
          },
        ]}>
        <Image
          source={getIconSource(demo.slug)}
          style={styles.image}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={demo.slug}
        />
      </View>
    </View>
  );
};

// One SpringBoard cell: a shared-bound Trigger keyed by slug (tap zooms it open
// via bounds().navigation.zoom()), wrapped in a long-press context menu — iOS
// home style — offering Inspiration / Share / View Code. The Trigger stays a
// stable mounted boundary (see git history: unmounting it stranded transition
// styles and blanked icons).
const AppIconComponent = ({
  demo,
  pageIndex,
  cellIndex,
  cellWidth,
  cellHeight,
  iconSize,
  onPress,
}: Props) => {
  const { slug, name } = demo;

  // Activate this icon's shared-bound Trigger only while its page is the visible
  // one. react-native-screen-transitions activates every boundary on a screen
  // the moment a transition to an interpolator screen is pending, and each
  // active boundary measures + runs a per-frame reaction. Gating on the visible
  // page keeps that to ~one page of icons. useSelector re-renders this icon only
  // when its own boolean flips (page enter/leave), not on every page change.
  const boundaryEnabled = useSelector(() => activePage$.get() === pageIndex);
  // While this icon's demo is open/closing, lift the WHOLE cell above its
  // sibling cells — see elevatedSlug$ in active-page.ts for why the library's
  // own boundary zIndex can't do this since the cell restructure.
  const elevated = useSelector(() => elevatedSlug$.get() === slug);
  const inspiration = AnimationInspirations[slug];
  const inspirationLink = inspiration?.link ?? null;

  const onInspiration = useCallback(() => {
    if (inspirationLink) Linking.openURL(inspirationLink);
  }, [inspirationLink]);

  const onShare = useCallback(() => {
    const url = sourceUrl(slug);
    Share.share({ message: `${name} — ${url}`, url });
  }, [slug, name]);

  const onViewCode = useCallback(() => {
    Linking.openURL(sourceUrl(slug));
  }, [slug]);

  return (
    // This wrapper is the page's DIRECT child — the actual stacking sibling of
    // every other cell. zIndex only wins against siblings, so the elevation for
    // the open icon must live at THIS level: inside zeego's wrappers (native
    // context-menu view > trigger view) it can never beat neighbouring cells,
    // which is exactly how the closing icon ended up painting under them.
    <View style={elevated ? styles.cellElevated : undefined}>
      <ContextMenu.Root>
        <ContextMenu.Trigger>
          <View style={[styles.cell, { width: cellWidth, height: cellHeight }]}>
            {/* Bound = the icon square only (the Trigger measures its OWN frame).
              The label lives outside it so it never enters the zoom. Tap-to-open
              lives on the Trigger (its press path captures the source bound), so
              the tap target is the icon — as on the iOS Home Screen. */}
            <Transition.Boundary.Trigger
              id={slug}
              group={BOUNDS_GROUP}
              enabled={boundaryEnabled}
              style={styles.iconBound}
              onPress={() => onPress(slug, cellIndex)}>
              {/* Instant touch-down feedback (iOS home dims the pressed icon).
                The open's navigate commit costs a real beat on JS, so without
                sub-frame feedback the tap reads as "nothing happened yet" —
                the dim acknowledges the touch on the very first frame. The
                function child reaches the Trigger's underlying Pressable. */}
              {({ pressed }: { pressed: boolean }) => (
                <View style={pressed ? styles.pressedDim : null}>
                  <IconSquare demo={demo} iconSize={iconSize} />
                </View>
              )}
            </Transition.Boundary.Trigger>
            <Text numberOfLines={1} style={styles.label}>
              {name}
            </Text>
          </View>
        </ContextMenu.Trigger>

        <ContextMenu.Content>
          {inspirationLink ? (
            <ContextMenu.Item key="inspiration" onSelect={onInspiration}>
              <ContextMenu.ItemTitle>Inspiration</ContextMenu.ItemTitle>
              <ContextMenu.ItemIcon ios={{ name: 'lightbulb' }} />
            </ContextMenu.Item>
          ) : null}
          <ContextMenu.Item key="share" onSelect={onShare}>
            <ContextMenu.ItemTitle>Share</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon ios={{ name: 'square.and.arrow.up' }} />
          </ContextMenu.Item>
          <ContextMenu.Item key="code" onSelect={onViewCode}>
            <ContextMenu.ItemTitle>View Code</ContextMenu.ItemTitle>
            <ContextMenu.ItemIcon
              ios={{ name: 'chevron.left.forwardslash.chevron.right' }}
            />
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
    </View>
  );
};

export const AppIcon = memo(AppIconComponent);

const styles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  // Applied to the OPEN icon's outermost wrapper while its demo is open or
  // closing: the shrinking screen morphs into this cell's icon, which must
  // paint above every sibling cell (iOS keeps the launching app's icon top).
  cellElevated: {
    elevation: 100,
    zIndex: 100,
  },
  // Wraps the icon square only — its measured frame is the zoom's source bound.
  iconBound: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconClip: {
    backgroundColor: '#1c1c1e',
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  // Soft elevation under each tile. Lives on a wrapper (not the clip) because
  // the clip's overflow:hidden would otherwise mask its own shadow.
  iconShadow: {
    borderCurve: 'continuous',
    boxShadow: '0px 5px 9px rgba(27, 34, 51, 0.18)',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  // iOS-style pressed acknowledgement on the icon square.
  pressedDim: {
    opacity: 0.6,
  },
  label: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
    maxWidth: '100%',
    textAlign: 'center',
  },
});
