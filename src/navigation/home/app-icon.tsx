import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { memo, useCallback } from 'react';

import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import * as ContextMenu from 'zeego/context-menu';

import { getIconSource } from './icon-source';
import { LaunchIcon } from './launch-icon';
import { launchGroupId } from './launch-transition';
import { usePressScale } from './press-scale';
import { ICON_RADIUS_RATIO } from './use-grid-layout';
import { AnimationInspirations } from '../../animations/inspirations';

import type { Demo } from './demos';

interface Props {
  demo: Demo;
  cellWidth: number;
  cellHeight: number;
  iconSize: number;
  onPress: (slug: string) => void;
}

/** How far an icon shrinks under the finger. */
const ICON_PRESSED_SCALE = 0.88;

// GitHub source for a demo — folder name === slug (see scripts/generate-icon-map).
const sourceUrl = (slug: string) =>
  `https://github.com/enzomanuelmangano/demos/tree/main/src/animations/${slug}`;

// Just the squircle icon (no label): the launch's shared element is the ICON's
// square, not the whole cell, so the card grows out of the icon and lands back
// on it — a label inside the source frame would move its centre off the icon.
const IconSquare = ({ demo, iconSize }: { demo: Demo; iconSize: number }) => {
  const radius = iconSize * ICON_RADIUS_RATIO;
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

// One SpringBoard cell: the launch icon (tap opens its demo out of it — see
// launch-icon.tsx), wrapped in a long-press context menu — iOS home style —
// offering Inspiration / Share / View Code.
const AppIconComponent = ({
  demo,
  cellWidth,
  cellHeight,
  iconSize,
  onPress,
}: Props) => {
  const { slug, name } = demo;
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

  const onOpen = useCallback(() => onPress(slug), [onPress, slug]);
  const press = usePressScale(ICON_PRESSED_SCALE);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        <View style={[styles.cell, { width: cellWidth, height: cellHeight }]}>
          {/* The tap target is the icon, as on the iOS Home Screen. The press
              lives out here rather than on the icon because the icon is the
              thing that travels; the icon only shows it (see LaunchIcon). */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${name}`}
            onPress={onOpen}
            onPressIn={press.onPressIn}
            onPressOut={press.onPressOut}>
            <LaunchIcon
              groupId={launchGroupId('grid', slug)}
              size={iconSize}
              radius={iconSize * ICON_RADIUS_RATIO}
              pressScale={press.scale}>
              <IconSquare demo={demo} iconSize={iconSize} />
            </LaunchIcon>
          </Pressable>
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
  );
};

export const AppIcon = memo(AppIconComponent);

const styles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    justifyContent: 'flex-start',
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
  label: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
    maxWidth: '100%',
    textAlign: 'center',
  },
});
