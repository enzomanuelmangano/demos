import { Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { memo, useCallback } from 'react';

import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { Link } from 'expo-router';
import * as ContextMenu from 'zeego/context-menu';

import { AnimationInspirations } from '../../../animations/inspirations';
import { getIconSource } from '../icon-source';
import { ICON_RADIUS_RATIO } from '../use-grid-layout';

import type { Demo } from '../demos';

interface Props {
  demo: Demo;
  cellWidth: number;
  cellHeight: number;
  iconSize: number;
}

// GitHub source for a demo — folder name === slug (see scripts/generate-icon-map).
const sourceUrl = (slug: string) =>
  `https://github.com/enzomanuelmangano/demos/tree/main/src/animations/${slug}`;

// NATIVE-SPIKE launcher cell — full parity with the main branch's AppIcon
// (long-press context menu: Inspiration / Share / View Code; pressed-dim
// feedback; label outside the zoom source), with the transition mechanism
// swapped: the icon square is a Link.AppleZoom source, so the open/close morph
// is UIKit's iOS 18 native zoom instead of the hand-built shared-bound zoom.
//
// Nesting: zeego's ContextMenu.Trigger wraps the whole cell (as on main), and
// the Link/AppleZoom/Pressable chain wraps the icon square inside it. The
// context menu recognizes long-press only, the Link's Pressable takes the tap —
// same division of touches the main branch had with its Boundary.Trigger.
const AppIconNativeComponent = ({
  demo,
  cellWidth,
  cellHeight,
  iconSize,
}: Props) => {
  const { slug, name } = demo;
  const radius = iconSize * ICON_RADIUS_RATIO;

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
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        <View style={[styles.cell, { width: cellWidth, height: cellHeight }]}>
          <Link href={`/animations/${slug}`} asChild>
            <Link.AppleZoom>
              <Pressable>
                {({ pressed }) => (
                  <View style={pressed ? styles.pressedDim : null}>
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
                            borderRadius: radius,
                            borderCurve: 'continuous',
                          },
                        ]}>
                        <Image
                          source={getIconSource(slug)}
                          style={styles.image}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          recyclingKey={slug}
                        />
                      </View>
                    </View>
                  </View>
                )}
              </Pressable>
            </Link.AppleZoom>
          </Link>
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

export const AppIconNative = memo(AppIconNativeComponent);

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
  pressedDim: {
    opacity: 0.6,
  },
});
